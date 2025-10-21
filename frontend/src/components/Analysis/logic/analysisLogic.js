
import { mapAbstractDriversFromConcrete } from './../../Lca/Logic/LcaDataManager';
import seedrandom from 'seedrandom';
import { saveDbChunk, getConcreteCostDriverArray } from '../analysisUtils';
const gaussian = require('gaussian');


//#region Main uncertainty quantification functions
//#region MC
const runSimpleMonteCarloSimulation = async ({
  iterations,
  scenarioData,
  simulator,
  stateReports,
  seed,
  projectName
}) => {
  const abstractCostDrivers = scenarioData.environmentImpactParameters.costDrivers;
  const drivers = getConcreteCostDriverArray(abstractCostDrivers);
  const driverCount = drivers.length;
  const prng = seedrandom(seed);

  stateReports.setStarted(1);
  stateReports.started = 1;


  const CHUNK_SIZE = 1000;
  const numChunks = Math.ceil(iterations / CHUNK_SIZE);

  for (let i = 0; i < numChunks; i++) {
    const remainingIterations = iterations - (i * CHUNK_SIZE);
    const iterationsInThisChunk = Math.min(remainingIterations, CHUNK_SIZE);
    // console.log(`[MC Chunk] Processing chunk ${i + 1}/${numChunks} with ${iterationsInThisChunk} iterations.`);
    const sampleRandMatrix = createSampleMatrix(iterationsInThisChunk, driverCount, prng);
    const sampleMatrix = mapSampleMatrixToDistributions(sampleRandMatrix, drivers);

    console.log("[runSimpleMonteCarloSimulation] sampleMatrix", sampleMatrix);

    // run simu for chunk
    const chunkResults = await monteCarlo_matrix({
      sampleMatrix,
      drivers,
      simulator,
      stateReports,
      progress_repeats: numChunks
    });

    if (chunkResults === "aborted" || chunkResults.error) {
      console.log("[runSimpleMonteCarloSimulation] analysis aborted", chunkResults);
      return "aborted";
    }

    const filteredResults = filterRunResults(chunkResults);
    console.log("[runSimpleMonteCarloSimulation] filteredResults", `mc_chunk_${i}`, filteredResults);
    await saveDbChunk(projectName, `mc_chunk_${i}`, filteredResults);

  }

  console.log("[runSimpleMonteCarloSimulation] complete");

  return {
    isChunked: true,
    chunkCount: numChunks
  };
};
//#endregion MC

//#region lsa
//Local sensitivity analysis
const localSensAnalysis = async ({
  iterations,
  scenarioData,
  simulator,
  stateReports,
  seed,
  projectName
}) => {
  const prng = seedrandom(seed);
  const abstractCostDrivers = scenarioData.environmentImpactParameters.costDrivers;
  const drivers = getConcreteCostDriverArray(abstractCostDrivers)
  const driverCount = drivers.length;
  const sampleRandMatrix = createSampleMatrix(iterations, driverCount, prng);

  stateReports.setStarted(1);
  stateReports.started = 1;

  // const allResults = [];
  const baselineMatrix = drivers.map(d => Array(1).fill(d.cost.mean)); // baseline matrix: all deterministic
  console.log("[runLocalSensitivityAnalysis] baselineMatrix", baselineMatrix, drivers);
  const baselineResults = await monteCarlo_matrix({
    sampleMatrix: baselineMatrix,
    drivers,
    simulator,
    stateReports,
    progress_repeats: driverCount + 0.1
  });
  const fBaselineResult = filterRunResults(baselineResults)
  // console.log("[runLocalSensitivityAnalysis] baselineResults", baselineResults, fBaselineResult);
  saveDbChunk(projectName, 'baseline', {
    driverName: "baseline",
    baselineResults: fBaselineResult[0],
    drivers
  });




  stateReports.started = 1;
  stateReports.setStarted(1);

  for (let d = 0; d < driverCount; d++) {
    const currDriver = drivers[d];
    console.log(`[runLocalSensitivityAnalysis] Analyzing driver ${d}: ${currDriver.name}`);


    const sampleMatrix = createSensitivitySampleMatrixMapping(sampleRandMatrix, d, drivers);
    console.log("[analysisLogic] localSA sampleMatrix", sampleMatrix, drivers);
    const results = await monteCarlo_matrix({
      sampleMatrix,
      drivers,
      simulator,
      stateReports,
      progress_repeats: driverCount + 1,  // to scale progress
    });

    if (results === "aborted" || stateReports.started === -1) {
      console.log("[runLocalSensitivityAnalysis] lsa aborted");
      return "aborted";
    }

    const variedInputSamples = sampleMatrix[d];
    const filteredResults = filterRunResults(results);

    saveDbChunk(projectName, `driver_${currDriver.name}`, {
      d,
      driverName: currDriver.name,
      results: filteredResults,
      inputSamples: variedInputSamples,
      baseMean: drivers[d].cost.mean
    });
    // console.log(`[runLocalSensitivityAnalysis] Progress: ${d + 1}/${driverCount}`);


  }
  console.log("[runLocalSensitivityAnalysis] complete");
  // return allResults;
  return {
    isChunked: true,
  };


}
//#endregion lsa


//#region Sobol GSA

const runSobolGSA = async ({ iterations, abstractDrivers, simulator, stateReports, seed, projectName }) => {
  const prng = seedrandom(seed);
  // console.log("[runSobolGSA] called with abstractDrivers", abstractDrivers, "and iterations", iterations);
  const drivers = getConcreteCostDriverArray(abstractDrivers)
  const driverCount = drivers.length;
  console.log("[runSobolGSA] called with drivers", drivers, driverCount, "and iterations", iterations);

  let matrixA = createSampleMatrix(iterations, driverCount, prng)
  let matrixB = createSampleMatrix(iterations, driverCount, prng)

  matrixA = mapMatrixToDistribution(matrixA, drivers) // todo replace with mapSampleMatrixToDistributions
  matrixB = mapMatrixToDistribution(matrixB, drivers)

  stateReports.setStarted(1);
  stateReports.started = 1;

  // console.log("Sobol GSA with matrixA", matrixA, "and matrixB", matrixB);

  // baseline simulations for A and B
  const resultsA = await monteCarlo_matrix({
    sampleMatrix: matrixA,
    drivers, simulator, stateReports,
    progress_repeats: driverCount + 2
  });
  const resultsB = await monteCarlo_matrix({
    sampleMatrix: matrixB,
    drivers, simulator, stateReports,
    progress_repeats: driverCount + 2
  });
  if (resultsA === "aborted" || resultsB === "aborted" || stateReports.started === -1) {
    console.log("[runLocalSensitivityAnalysis] lsa aborted");
    return "aborted";
  }
  saveDbChunk(projectName, 'aMatrix', resultsA);
  saveDbChunk(projectName, 'bMatrix', resultsB);
  // console.log("Sobol GSA: Saved base results for A and B");

  // console.log("Sobol GSA with base results", resultsA, resultsB);

  // const sobolResults = [];
  for (let i = 0; i < driverCount; i++) {
    // console.log(`[runLocalSensitivityAnalysis] Start Progress: ${i + 1}/${driverCount}+2`);
    const matrixC = createSobolC(matrixA, matrixB, i); //replace row i from A with that from B
    const resultsC = await monteCarlo_matrix({   // simulate matrix C
      sampleMatrix: matrixC,
      drivers,
      simulator,
      stateReports,
      progress_repeats: driverCount + 2,
    });

    if (resultsC === "aborted" || stateReports.started === -1) {
      console.log("[runLocalSensitivityAnalysis] lsa aborted");
      return "aborted";
    }


    // save result for this driver
    const filteredResults = filterRunResults(resultsC);
    saveDbChunk(projectName, `driver_${drivers[i].name}`, {
      driverIndex: i,
      results: filteredResults,
      driverName: drivers[i].name,
    });

  }

  return {
    isChunked: true,
  };
}
//#endregion gsa

//#endregion main

//#region Main Simulator
const monteCarlo_matrix = async ({
  sampleMatrix, // [driver][iteration]
  drivers,
  simulator,
  stateReports,
  progress_repeats = 1
}) => {
  // console.log("[monteCarlo_matrix] called with drivers", drivers, sampleMatrix);
  const iterations = sampleMatrix[0].length;
  const driverCount = sampleMatrix.length;

  const progressPerSimulation = Math.max(0.001, 100 / (progress_repeats * iterations));
  // console.log("[monteCarlo_matrix] progressPerSimulation", progressPerSimulation, progress_repeats, iterations, stateReports.started, drivers);
  let completed = 0; // track finished simulations
  const simulationPromises = [];

  for (let i = 0; i < iterations; i++) {
    if (stateReports.started === -1)
      return "aborted";
    const sampledDrivers = JSON.parse(JSON.stringify(drivers));
    for (let d = 0; d < driverCount; d++) {
      sampledDrivers[d].cost = sampleMatrix[d][i];
    }

    const abstractCostDrivers = mapAbstractDriversFromConcrete(sampledDrivers);

    const simPromise = simulator(abstractCostDrivers, i + 1)
      .then(result => {
        completed++;
        // Update progress when this simulation finishes
        const progress = (completed / iterations) * 100;
        // console.log("[monteCarlo_matrix] progress", completed, progress, stateReports.started, progressPerSimulation, stateReports.started + progressPerSimulation,);
        try {
          stateReports.started = stateReports.started + progressPerSimulation
          stateReports.setStarted(stateReports.started);
          if (stateReports.started % 100 === 0) console.log("[monteCarlo_matrix] progress", completed, progress, stateReports.started, progressPerSimulation);
        } catch (error) {
          console.log("[monteCarlo_matrix] progress update error", error);
        }

        if (result) {
          if (result.error) {
            console.log("[monteCarlo_matrix] simulator error at", i, result.error, sampledDrivers, sampleMatrix);
          }
          // console.log("[monteCarlo_matrix] !!!!!! result of", i, "with", result);
          result.sampleIndex = i;
          result.sampledConfig = sampledDrivers;
          return result;
        }
        return null;
      })
      .catch(err => {
        completed++;
        const progress = (completed / iterations) * 100;
        try {
          stateReports.setStarted(stateReports.started);
          stateReports.started = stateReports.started + progressPerSimulation
        } catch (error) {
          console.log("[monteCarlo_matrix] progress update error", error);
        }

        console.log("[monteCarlo_matrix] simulator error at", i, err, sampledDrivers);
        return { error: err, sampleIndex: i };
      });

    simulationPromises.push(simPromise);
  }

  // wait for all simulations to complete
  const simulationResults = await Promise.all(simulationPromises);

  // console.log("[monteCarlo_matrix] simulationResults", simulationResults);
  return simulationResults.filter(Boolean); // filter out failed/null runs
};
//#endregion main simu




//#region Matrix functions
function printMatrix(a) {
  a.forEach(v => console.log(...v));
}


/**
 * create a random Matrix: amount of driver x iterations with random values in [0,1]
 * @param {int} iterations 
 * @param {int} driverCount 
 * @returns 
 */
function createSampleMatrix(iterations, driverCount, prng) {
  const matrix = [];
  for (let i = 0; i < driverCount; i++) {
    const row = [];
    for (let j = 0; j < iterations; j++) {
      const r = prng();
      const safeR = Math.min(1 - 1e-12, Math.max(1e-12, r));
      row.push(safeR);

    }
    matrix.push(row);
  }
  return matrix;
}


function mapSampleMatrixToDistributions(sampleMatrix, drivers) {
  return sampleMatrix.map((row, driverIndex) => {
    // c#onst driverName = Object.keys(driversByName)[driverIndex];
    const driver = drivers[driverIndex];

    return row.map(rawSample => {
      let r = mapToDist(driver, rawSample)
        ; if (r === Infinity) console.log("r is inf for", driver, rawSample);
      return r;
    });
  });
}


/**
 * maps each  value in[0,1] in the matrix to a distribution 
 * @param {2d matrix [[]]} A
 * @param {object} costDriversById 
 * @returns 
 */
function mapMatrixToDistribution(A, costDriversById) {
  // printMatrix(A)
  const mappedA = []
  console.log("######")
  const driverKeys = Object.keys(costDriversById);
  for (let i = 0; i < A.length; i++) {
    let currentDriver = costDriversById[driverKeys[i]]
    const row = A[i].map((u, j) => {
      return mapToDist(currentDriver, u);
    });
    mappedA.push(row);
    // console.log("mapping ", i)
    // printMatrix(mappedA)
  }
  // console.log("mapping ")
  // printMatrix(mappedA)
  return mappedA;

}


//#region sobol matrices
/**
 * replace row j in matrixA with that row in matrixB
 * @returns 
 */
function createSobolC(matrixA, matrixB, j) {
  const C = [];
  for (let r = 0; r < matrixA.length; r++) {
    if (r === j) {
      C.push([...matrixB[r]]);  // take from B
    } else {
      C.push([...matrixA[r]]);  // keep from A
    }
  }
  return C;
}


//#endregion sobol matrices


//#region lsa matrices
/**
 * Maps one row of the sampleRandMatrix to a distribution and the other rows to their deterministic value/mean
*/
const createSensitivitySampleMatrixMapping = (sampleRandMatrix, varyingDriverIndex, drivers) => {
  const iterations = sampleRandMatrix[0].length;
  const driverCount = drivers.length;

  const lsaSampleMatrix = [];
  for (let i = 0; i < driverCount; i++) {

    if (i === varyingDriverIndex) {
      // perturb driver using its distribution
      const variedDriver = drivers[i];
      const variedSamples = sampleRandMatrix[i].map(r => mapToDist(variedDriver, r));

      lsaSampleMatrix.push(variedSamples);
    } else {
      // Fix drivers at mean values
      const meanValue = drivers[i].cost.mean;
      lsaSampleMatrix.push(Array(iterations).fill(meanValue));

    }

  }

  return lsaSampleMatrix;
}
//#endregion lsa matrices

//#endregion matrix functions




//#region data processing
/**
 * random value in [0,1] to the drivers distribution
 * if r=-1, returns the deterministic value
 */
function mapToDist(driver, r) {
  // console.log("mapToDist", driver, r);

  const cost = driver.cost;
  const dist = driver.distType;
  if (!dist) {
    return driver.cost;
  }

  if (r === -1) { // in case no random value, return deterministic value
    // console.log("No random value for", driver.name, dist)
    return driver.mean;
  }
  const EPS = 1e-12;
  const safeR = Math.min(1 - EPS, Math.max(EPS, r));


  switch (dist) {
    case "normal": {
      const standard = gaussian(0, 1);
      // gaussian.js `ppf()` for inverse CDF
      const z = standard.ppf(safeR);
      // Scale by mean & standard deviation
      return cost.mean + z * cost.stdDev;
    }
    case "triangular": {
      const { min, mode, max } = cost;
      const c = (mode - min) / (max - min);
      return safeR < c
        ? min + Math.sqrt(safeR * (max - min) * (mode - min))
        : max - Math.sqrt((1 - safeR) * (max - min) * (max - mode));
    }
    case "uniform":
      return cost.min + r * (cost.max - cost.min);
    case "deterministic": {
      return driver.mean;
    }
    case "lognormal": {
      const standard = gaussian(0, 1);
      const z = standard.ppf(safeR);
      // safe even if GSD < 1
      return cost.geoMean * Math.pow(cost.gsd, z);

    }

    default:
      console.log("Unknown distribution type:", dist);
  }

}

// Function to process the results and only keep the sustainability XML file
function filterRunResults(runObjects) {
  // console.log("runObjects", runObjects);
  if (Array.isArray(runObjects)) {
    return runObjects.map(run => {
      if (run && Array.isArray(run.files)) {
        // console.log("run.files", run.files);
        const sustainabilityFile = run.files.find(fileName =>
          fileName.includes("sustainability_global_information_statistic.xml")
        );

        return {
          ...run,
          files: sustainabilityFile ? [sustainabilityFile] : [],
        };
      }

      return run;
    });
  }

  return runObjects;
}

//#endregion data processing

//#region Exported functions
export {
  runSimpleMonteCarloSimulation,
  localSensAnalysis,
  getConcreteCostDriverArray,
  runSobolGSA,
  filterRunResults
}

//#endregion



