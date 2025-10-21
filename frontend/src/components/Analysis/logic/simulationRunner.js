import axios from 'axios';
import { setFile } from '../../../util/Storage';
import { convertScenario } from 'simulation-bridge-converter-scylla/ConvertScenario';
import { runSimpleMonteCarloSimulation, localSensAnalysis, runSobolGSA, filterRunResults } from "./analysisLogic";
import { saveDbChunk, deleteProjectData } from '../analysisUtils';

//#region main entry point
// This is the main entry point called from UncertaintyPage to run the selected analysis
export const runMultipleSimulations = async ({
  scenarioName,
  iterations,
  getData,
  projectName,
  stateReports,
  cancelToken,
  toolName
}) => {
  // console.log("[simulationRunner] runMultipleSimulations(): called with scenarioName", scenarioName, "and mc iterations", MC_ITERATIONS);
  let variants = getData().getCurrentScenario().environmentImpactParameters.variants;
  // console.log("[simulationRunner] runMultipleSimulations(): start simulation, Vaiants:", variants)
  if (variants.reduce((sum, variant) => sum + parseInt(variant.frequency), 0) !== 100) ///todo: If variants have  decimals the sum check will fail
  {
    stateReports.toasting("error", "Frequencies sum is not 100%", "For correct simulation, the sum of frequencies must be 100%");

    return;
  }

  stateReports.setFinished(false);
  stateReports.setStarted(1);
  try {
    const scenarioData = getData().getScenario(scenarioName);
    // console.log('ScenarioData', scenarioData);

    const simulator = createSimulator(scenarioData, scenarioName, stateReports, cancelToken, projectName);
    let simulationResults = {
      toolName,
      chunkInfo: {},
      finished: null,
      durationMs: null,
      iterations,
      driverCount: scenarioData.environmentImpactParameters.costDrivers.length
    };
    simulationResults.toolName = toolName;
    deleteProjectData(projectName);
    const startTime = Date.now();
    const seed = 42;

    switch (toolName) {
      case "monte carlo":
        console.log("runSimpleMonteCarloSimulation with scenarioData", scenarioData, "and mc iterations", iterations);
        simulationResults.chunkInfo = await runSimpleMonteCarloSimulation({ iterations, scenarioData, simulator, stateReports, seed, projectName });
        console.log("simulation mc Run completed");
        break;
      case "local SA":
        console.log("localSensAnalysis with scenarioData", scenarioData, "and mc iterations", iterations);
        simulationResults.chunkInfo = await localSensAnalysis({ iterations, scenarioData, simulator, stateReports, seed, projectName });
        console.log("simulation local SA Run completed",);
        break;

      case "sobol GSA":
        console.log("[analysisLogic] sobol GSA with scenarioData", scenarioData, "and mc iterations", iterations);
        simulationResults.chunkInfo = await runSobolGSA({ iterations: iterations, abstractDrivers: scenarioData.environmentImpactParameters.costDrivers, simulator, stateReports, seed, projectName })
        console.log("simulation sobol GSA completed",);
        break;
      case "deterministic":
        simulationResults.runs = []
        const detRun = await simulator(scenarioData.environmentImpactParameters.costDrivers, 1);
        if (detRun === "aborted" || detRun.error) {
          console.log("[runDeterministicSimulation] Analysis aborted", detRun);
          break
        }
        const filteredResults = filterRunResults([detRun]);
        await saveDbChunk(projectName, `det_chunk_0`, filteredResults);
        // simulationResults.runs.push(detRun);
        simulationResults.chunkInfo = { isChunked: true, chunkCount: 1 };
        console.log("simulation deterministic Run completed");
        break;
      default:
        console.log("Unknown analysis name:", toolName);
        break;
    }

    const endTime = Date.now();
    simulationResults.finished = endTime;
    simulationResults.durationMs = endTime - startTime; // duration [milliseconds]


    // stateReports.setStarted(0);
    stateReports.started = 0;
    stateReports.setStarted(100)
    stateReports.setFinished(true);

    stateReports.toasting("success", "Monte Carlo Simulation", `Completed ${iterations} simulations in ${simulationResults.durationMs} ms`)
    // console.log("[simulationRunner] runMultipleSimulations(): Simulation Results:", simulationResults);
    await saveDbChunk(projectName, 'analysisResults', simulationResults);

    stateReports.toasting("success", "Success", "Analysis was successful");

  } catch (err) {
    stateReports.setStarted(false);
    stateReports.setErrored(true);
    console.log("[Analysisss Mistake]", err);
    stateReports.toasting("error", "Error", "Analysis was not successful");
  }
}

//#endregion main entry point

//#region prepare and communicate with simulation API 
/**
 * Simulator to give to the specific uncertainty quantification tools
 */
function createSimulator(scenarioData, scenarioName, stateReports, cancelToken, projectName) {
  return async function (drivers, iteration) {
    // console.log("[createSimulator()] drivers", drivers, scenarioData);
    // Deep copy to avoid mutating original
    let scenarioName_i = scenarioName + "_" + iteration;
    const scenarioCopy = structuredClone(scenarioData);
    scenarioCopy.environmentImpactParameters.costDrivers = drivers;

    // console.log("[createSimulator()] scenarioCopy", scenarioCopy);
    const { globalConfig, simConfigs } = await convertScenario(scenarioCopy);
    scenarioCopy.scenarioName = scenarioName_i

    // console.log("globalConfig", globalConfig);
    // console.log("simConfigs", simConfigs[0]);

    const simConfig = simConfigs[0]; //TODO magic index access
    const processModel = scenarioData.models[0]; //TODO magic index access

    let bpmn = processModel.BPMN;
    bpmn = bpmn.replace(/'/g, "");
    //console.log('BPMN', bpmn);
    return await simulate(globalConfig, simConfig, scenarioName_i, processModel, bpmn, stateReports, cancelToken, projectName);
  };
}



// function to call the simulation API in scylla
const simulate = async (globalConfig, simConfig, scenarioName, processModel, bpmn, stateReports, cancelToken, projectName) => {
  // Resetting response and finished states
  // stateReports.setResponse({ message: "", files: [] });
  stateReports.setErrored(false);

  // console.log("[simulate] called with", globalConfig, simConfig, scenarioName, processModel);

  const requestId = 'request' + Math.random();
  const formData = new FormData();

  try {
    const bpmnFile = new File([bpmn], processModel.name + '.bpmn')
    const globalConfigFile = new File([globalConfig], scenarioName + '_Global.xml')
    const simConfigFile = new File([simConfig], scenarioName + '_' + bpmnFile.name + '_Sim.xml')

    formData.append("bpmn", bpmnFile, bpmnFile.name);
    formData.append("globalConfig", globalConfigFile, globalConfigFile.name);
    formData.append("simConfig", simConfigFile, simConfigFile.name);
    // console.log("[simulation] formData", formData);

    // todo: reactivate
    const r = await axios.post("http://127.0.0.1:8080/scyllaapi", formData, {
      headers: {
        'requestId': requestId,
        'Content-Type': 'multipart/form-data'
      },
      cancelToken: cancelToken
    });
    r.data.files.forEach(file => {
      setFile(projectName, requestId + '/' + file.name, file.data);
    })
    // console.log("[simulation] response", r.data);

    // Setting the response state and updating the finished and started states
    const responseObject = {
      message: r.data.message,
      files: r.data.files.map(file => file.name),
      finished: new Date(),
      requestId
    }
    // const responseObject = { }
    return responseObject;
  } catch (err) {
    if (axios.isCancel(err)) {
      // stateReports.toasting("success", "Success", "Analysis was canceled");

    } else {
      stateReports.setErrored(true);
      console.log("[Simulation Mistake]", err, globalConfig)
    }
    return { 'error': err };
  }
};

//#endregion

