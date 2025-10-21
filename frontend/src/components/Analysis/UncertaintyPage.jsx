import React, { useState, useRef, useEffect } from "react";
import { db } from './db'
import axios from 'axios';
import { Flex, Heading, Card, CardHeader, CardBody, Text, Select, Stack, Button, Progress, Box, Textarea, UnorderedList, ListItem, Grid, Input } from '@chakra-ui/react';
import { FiChevronDown } from 'react-icons/fi';


import RunProgressIndicationBar from "../RunProgressIndicationBar";
import ToolRunOutputCard from "../ToolRunOutputCard";
import DriverEditTab from "./components/DriverEditTab";
import CostCharts from "./components/UncertaintyResultCard";

import { runMultipleSimulations } from './logic/simulationRunner';
import { getConcreteCostDriverArray } from './analysisUtils'
import UncertaintyResultCard from "./components/UncertaintyResultCard";
import { saveAllCostDrivers, mapAbstractDriversFromConcrete } from "../Lca/Logic/LcaDataManager";


const UncertaintyPage = ({ projectName, getData, toasting }) => {

  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState(false);
  const [errored, setErrored] = useState(false);
  // const [response, setResponse] = useState(JSON.parse(sessionStorage.getItem(projectName + '/analysisResults')) || {});
  // const [response, setResponse] = useState(loadLargeAnalysis(projectName));
  const [response, setResponse] = useState({});


  const [scenarioName, setScenarioName] = useState();
  const [simulator, setSimulator] = useState();
  const [simulationDriverSettings, setSimulationDriverSettings] = useState(getData().getCurrentScenario().environmentImpactParameters.costDrivers);

  const [selectToolName, setSelectToolName] = useState();
  const [analysisTypes, setAnalysisTypes] = useState(["deterministic", "monte carlo", "local SA", "sobol GSA"]);
  const [selectedIterations, setSelectedIterations] = useState(100);

  const [resToolName, setResToolName] = useState();
  const [resAnalysisTypes, setResAnalysisTypes] = useState(["deterministic", "monte carlo", "local SA", "sobol GSA"]);
  const [resIterations, setResIterations] = useState(100);


  const driverEditGridSize = "220px 150px 400px 100px";
  const source = useRef(null);


  useEffect(() => {
    // Fetching scenario names from data
    let simulationDriverSettings = getData().getCurrentScenario().environmentImpactParameters.costDrivers;
    console.log("[Analyss Page] useEffect(): costDrivers", simulationDriverSettings);
  }, [getData]);


  const handleDriverUpdate = (abstractIndex, concreteIndex, updatedDriver) => {
    setSimulationDriverSettings((prevAC) => {
      console.log("handleDriverUpdate: updatedDriver", updatedDriver);
      const newAbstractSettings = structuredClone(simulationDriverSettings);
      // console.log("handleDriverUpdate: prevAC", prevAC, newAbstractSettings);
      newAbstractSettings[abstractIndex].concreteCostDrivers[concreteIndex] = updatedDriver;
      const allConcreteDrivers = getConcreteCostDriverArray(newAbstractSettings);
      const rebuiltAbstractDrivers = mapAbstractDriversFromConcrete(allConcreteDrivers);

      // Save  new settings
      saveAllCostDrivers(
        rebuiltAbstractDrivers,
        getData().getCurrentScenario().environmentImpactParameters.calcType,
        getData
      );

      return rebuiltAbstractDrivers;
    });
  };

  // Overwrite all drivers Input: abstract -> output: abstract
  const overwriteAllDrivers = (newDriversStructure) => {
    if (!Array.isArray(newDriversStructure) || newDriversStructure.length === 0) {
      console.warn("[overwriteAllDrivers] Skipping overwrite: Input was empty, null, or invalid.", newDriversStructure);
      return;
    }
    setSimulationDriverSettings(() => {
      console.log("[overwriteAllDrivers] newDriversStructure", newDriversStructure);
      const allConcreteDrivers = getConcreteCostDriverArray(newDriversStructure); //Flatten abstract to plain concrete
      const rebuiltAbstractDrivers = mapAbstractDriversFromConcrete(allConcreteDrivers); // rebuild moddle abstract structure
      console.log("[overwriteAllDrivers] rebuiltAbstractDrivers", newDriversStructure, rebuiltAbstractDrivers);
      saveAllCostDrivers(
        rebuiltAbstractDrivers,
        getData().getCurrentScenario().environmentImpactParameters.calcType,
        getData
      );

      return rebuiltAbstractDrivers;
    });
  };

  const start = async () => {
    // console.log("Iteration", selectedIterations);
    const stateReports = { 'toasting': toasting, 'setResponse': setResponse, 'setStarted': setStarted, 'setFinished': setFinished, 'setErrored': setErrored, 'started': started }
    // console.log("sim drivers", simulationDriverSettings)
    const currentScenario = getData().getCurrentScenario();
    currentScenario.environmentImpactParameters.costDrivers = simulationDriverSettings;
    source.current = axios.CancelToken.source();

    await runMultipleSimulations({
      scenarioName,
      iterations: selectedIterations,
      getData,
      projectName,
      stateReports,
      cancelToken: source.current.token,
      toolName: selectToolName
    });

    const finalResults = await loadLargeAnalysis(projectName);
    setResponse(finalResults);
    console.log("[Analyss Page start()] Finished simulations", finalResults); //response.runs.length
  }

  useEffect(() => {
    const fetchInitialData = async () => {
      console.log("fetchInitialData");
      const data = await loadLargeAnalysis(projectName);
      setResponse(data);
    };

    fetchInitialData();
  }, [projectName]);

  const handleAfterUpload = async () => {
    const finalResults = await loadLargeAnalysis(projectName);
    setResponse(finalResults);
  };

  // Function to abort simulation
  const abort = () => {
    console.log("abort");
    // Cancelling source and updating finished and started states
    source.current.cancel("Simulation was canceled");
    setStarted(-1);
    setResponse({ message: "canceled" });
  };

  //#region Return 
  return (
    <Box h="93vh" overflowY="auto" p="5" >
      <Stack gap="2">
        <Heading size='lg' >Sensitivity Analysis</Heading>
        <Card bg="white">
          <CardHeader>
            <Heading size='md'> Environmental Simulation Parameters</Heading>
          </CardHeader>
          <CardBody>
            <Grid templateColumns={driverEditGridSize} gap={4} mb={2} width={"60%"}>
              {/* Header row */}
              <Text fontWeight="bold">Name</Text>
              <Text fontWeight="bold">Distribution Type</Text>
              <Text fontWeight="bold">Cost Parameters</Text>
              <Text fontWeight="bold">Actions</Text>
            </Grid>


            {/* Rows */}
            {simulationDriverSettings.map((abstractDriver, abstractIndex) =>
              abstractDriver.concreteCostDrivers.map((concreteDriver, concreteIndex) => (
                <DriverEditTab
                  key={`${concreteDriver.id}`}
                  driverEditGridSize={driverEditGridSize}
                  concreteCostDriver={concreteDriver}

                  onUpdate={(updatedDriver) =>
                    handleDriverUpdate(abstractIndex, concreteIndex, updatedDriver)
                  }
                />
              ))
            )}

            <Text fontSize="xs" color="#c5d2d3ff" fontWeight="light" textAlign="left" mt="2">Warning: Updating the some cost parameters will not change automatically change the others witch in case of the mean may lead to faulty normalization. </Text>

          </CardBody>
          <CardHeader>
            <Heading size='md'> Start Analysis Run </Heading>
          </CardHeader>
          <CardBody>

            <Flex
              gap="5"
              flexDirection="row"
              alignItems="end"
              mt="-4"
            >
              <Box>
                <Text fontSize="s" textAlign="start" color="#485152" fontWeight="bold" > Select Analysis:</Text>
                <Select value={selectToolName} placeholder='choose analysis' width='100%' {...(!selectToolName && { color: "gray" })} backgroundColor='white' icon={<FiChevronDown />} onChange={evt => setSelectToolName(evt.target.value)}>
                  {
                    analysisTypes.map((type, index) => {
                      return <option value={type} color="black">{type}</option>
                    })
                  }
                </Select>
              </Box>
              {selectToolName !== "deterministic" && (
                <Box mt={4}>
                  <Text fontSize="s" textAlign="start" color="#485152" fontWeight="bold">
                    Select Iterations:
                  </Text>
                  <Input
                    type="number"
                    value={selectedIterations}
                    onChange={(e) => setSelectedIterations(parseInt(e.target.value) || 1)}
                    min={1}
                    max={10000} // optional upper limit
                    backgroundColor="white"
                  />
                </Box>
              )}
              <Box>
                <Text fontSize="s" textAlign="start" color="#485152" fontWeight="bold" > Select scenario:</Text>
                <Select value={scenarioName} placeholder='choose scenario' width='100%' {...(!scenarioName && { color: "gray" })} backgroundColor='white' icon={<FiChevronDown />} onChange={evt => setScenarioName(evt.target.value)}>
                  {
                    getData().getAllScenarios().map((scenario, index) => {
                      return <option value={scenario.scenarioName} color="black">{scenario.scenarioName}</option>
                    })
                  }
                </Select>
              </Box>
              <Box>
                <Text fontSize="s" textAlign="start" color="#485152" fontWeight="bold" > Select simulator:</Text>
                <Select value={simulator} placeholder='choose simulator' width='100%'  {...(!simulator && { color: "gray" })} backgroundColor='white' icon={<FiChevronDown />} onChange={evt => setSimulator(evt.target.value)}>
                  <option value='Scylla' color="black">Scylla</option>
                </Select>
              </Box>

              {(started === 0 || started === 100 || started === false || started === -1) ? (
                <Button variant="outline" bg="#FFFF" onClick={start} disabled={!scenarioName || !simulator}>
                  <Text color="RGBA(0, 0, 0, 0.64)" fontWeight="bold">Start Simulation</Text>
                </Button>) :

                (
                  <Button variant="outline" bg="#FFFF" onClick={abort}>
                    <Text color="RGBA(0, 0, 0, 0.64)" fontWeight="bold">Abort Simulation</Text>
                  </Button>
                )}
              {typeof started === 'number' && (<Text fontSize="s" textAlign="start">Progress: {started.toFixed(0)}%</Text>)}
              {/* <Text fontSize="s" textAlign="start" > Results?:  {JSON.stringify(started)}</Text> */}
              {/* .toFixed(2) */}


            </Flex>
          </CardBody>
        </Card>
        {/* #region Header Section */}
        <RunProgressIndicationBar {...{ started, finished, errored }} />
        <ToolRunOutputCard {...{
          projectName, response: response.runs, toolName: resToolName,
          processName: 'uncertainty', filePrefix: response.requestId, 'setResponse': setResponse, 'setToolName': setResToolName, 'durationMs': response.durationMs,
          toasting, 'drivers': simulationDriverSettings, 'iterations': resIterations, onUploadComplete: handleAfterUpload
        }} />
        {/* <Text fontSize="s" textAlign="start" > Help: {JSON.stringify(response) }</Text> */}
        {response && response.runs && ((response.runs.length > 0) || response.runs.sobolResults) &&
          <UncertaintyResultCard {... { response: response, projectName: projectName, drivers: getConcreteCostDriverArray(simulationDriverSettings) }} />
        }
        {/* #endregion */}


      </Stack>
    </Box>
  )

  //#endregion return

  //#region load file data
  async function loadLargeAnalysis(projectName) {
    // Fetch all chunks for given project in one go
    const allChunks = await db.chunks.where({ projectName }).toArray();
    console.log("[loadLargeAnalysis] allChunks:", allChunks);
    if (allChunks.length === 0) {
      return {}; // No data found
    }

    // Find main 'analysisResults' chunk to get metadata
    const mainResultChunk = allChunks.find(c => c.key === 'analysisResults');
    // console.log("[loadLargeAnalysis] mainResultChunk:", mainResultChunk);
    if (!mainResultChunk) return {}; // Metadata is missing

    const sessionResults = mainResultChunk.data;
    console.log("[loadLargeAnalysis] sessionResults:", sessionResults);

    const loadedToolName = sessionResults.toolName;
    if (!loadedToolName) {
      console.log("[loadLargeAnalysis] db results missing toolName. Loading skipped.");
      return {};}

    // Rebuild full object from fetched chunks
    const detRuns = sessionResults.runs;
    const chunkInfo = sessionResults.chunkInfo;
    const concDrivers = getConcreteCostDriverArray(sessionResults.driversStructure || simulationDriverSettings);
    const driverCount = sessionResults.driversStructure?.length || concDrivers?.length;

    let runs = {};
    // console.log("[loadLargeAnalysis] projectName:", projectName, driverCount, toolName,);

    // find chunk data from pre-fetched array
    const findChunkData = (key) => allChunks.find(c => c.key === key)?.data;

    switch (loadedToolName) {
      case 'sobol GSA': {
        runs.aMatrix = findChunkData('aMatrix') || [];
        runs.bMatrix = findChunkData('bMatrix') || [];
        runs.sobolResults = [];
        for (let i = 0; i < driverCount; i++) {
          const driverData = findChunkData(`driver_${concDrivers[i].name}`);
          if (driverData) {
            runs.sobolResults.push(driverData);
          }
        }
        break;
      } case 'local SA': {
        const lsaRuns = [];

        // baseline
        const baselineData = findChunkData('baseline');
        // console.log("[loadLargeAnalysis] baselineData:", baselineData);
        if (baselineData) {
          lsaRuns.push(baselineData);
        }
        // drivers
        for (let i = 0; i < driverCount; i++) {
          const driverData = findChunkData(`driver_${concDrivers[i].name}`);
          // console.log("[loadLargeAnalysis] driverData:", driverData,`driver_${concDrivers[i].name}` );
          if (driverData) {
            lsaRuns.push(driverData);
          }
        }
        if (lsaRuns.length > 0) {
          runs = [
            lsaRuns[0],
            ...lsaRuns.slice(1).sort((a, b) => a.driverName.localeCompare(b.driverName))
          ];
        } else {
          runs = [];
        }

        break;
      } case 'monte carlo': {
        let mcResults = [];
        // loop through number of chunks stored in metadata
        for (let i = 0; i < chunkInfo.chunkCount; i++) {
          const chunkData = findChunkData(`mc_chunk_${i}`);
          if (chunkData) {
            // Concatenate array of results from each chunk
            mcResults = mcResults.concat(chunkData);
          }
        }
        runs = mcResults; // combined array
        break;
      } case 'deterministic': {
        let detResults = [];
        console.log("[loadLargeAnalysis] detRuns:", chunkInfo);
        for (let i = 0; i < chunkInfo.chunkCount; i++) {
          const chunkData = findChunkData(`det_chunk_${i}`);
          if (chunkData) {
            // Concatenate array of results from each chunk
            detResults = detResults.concat(chunkData);
          }
        }
        runs = detResults; // combined array
        break;

      }

    }

    const results = {
      toolName: loadedToolName,
      finished: sessionResults.finished,
      durationMs: sessionResults.durationMs,
      iterations: sessionResults.iterations,
      runs
    };
    overwriteAllDrivers(sessionResults.driversStructure);
    // setToolName(toolName);
    // setSelectedIterations(sessionResults.selectedIterations);
    setResToolName(loadedToolName);
    setResIterations(sessionResults.iterations);
    console.log("[loadLargeAnalysis] results:", results);
    return results;
  }
  //#endregion load file data
}

export default UncertaintyPage;



