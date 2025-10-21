import { db } from './db';
import {  fetchFileBlob } from "../../util/Storage";
import Tar from 'tar-js';
import { saveAs } from 'file-saver';

export async function saveDbChunk(projectName, key, data) {
    console.log(`Saving chunk ${key} to IndexedDB for project: ${projectName}`, data);
    if (key === undefined || key === null) return;

    try {
        await db.chunks.put({
            projectName,
            key,
            data
        });
    } catch (e) {
        console.error(`Failed to save chunk ${key} to IndexedDB`, e);
    }
}

export async function deleteProjectData(projectName) {
    try {
        await db.chunks
            .where('projectName') // secondary index
            .equals(projectName)
            .delete();
        console.log(`Successfully deleted all chunks for project: ${projectName}`);
    } catch (e) {
        console.error(`Failed to delete chunks for project ${projectName}`, e);
    }
}

/**
 * formats a number into scientific notation with two decimal places
 *          except:
 *          0 -> "0"
 *          exponents of 0 -> not shown
 * @param {} number 
 * @returns formattedNumber 
 * @returns exponent
 */
export function formatNumber(number) {
    if (typeof number !== "number") return ["-", "-"];
    // console.log("formatNumber called with:", number);
    if (number === 0) return ["0", "0"];
    let [coefficient, exponent] = number.toExponential(2).split('e');
    let formattedNumber;
    if (exponent === "0" || exponent === "+0" || exponent === "-0") {
        formattedNumber = coefficient;
    } else
        formattedNumber = `${coefficient} × 10`;
    // console.log("number:", number, "Exponent:", exponent, typeof exponent);
    return [formattedNumber, exponent];
}


export function formattedToString(value) {
    const formatted = formatNumber(value); // toExponential display
    // console.log("formatted", formatted);
    if (formatted[1] === "0" || formatted[1] === "+0" || formatted[1] === "-0") return formatted[0];
    return formatted[0] + "E" + formatted[1];
}



/**
 * Create map of all cost drivers by Id for faster finding
 */
export function getConcreteCostDriverArray(abstractCostDrivers) {
    if (!Array.isArray(abstractCostDrivers)) {
    return [];
  }
  const drivers = [];
  for (const abstractDriver of abstractCostDrivers) {
    if (!abstractDriver.concreteCostDrivers) continue;
    // console.log("!!!!!!!!!!!!!abstractDriver:", abstractDriver);
    for (const concrete of abstractDriver.concreteCostDrivers) {

      drivers.push({
        ...concrete,
        category: abstractDriver.id
      });
    }
  }
  return drivers;
}


function getFilesForTar(roundOfRuns, projectName, pathPrefix = "") {
    const filePromises = [];
    const REQUIRED_FILE = "sustainability_global_information_statistic.xml";

    for (let idx = 0; idx < roundOfRuns.length; idx++) {
        const res = roundOfRuns[idx];
        if (!res.files) continue;

       // filter to only the environmental file
        const filesToArchive = res.files.filter(fileName => fileName === REQUIRED_FILE);

        for (const fileName of filesToArchive) {
            const runPrefix = `run${idx + 1}_`;
            const newFileName = runPrefix + fileName;
            const archivePath = newFileName;
            const fullPath = pathPrefix ? `${pathPrefix}/${archivePath}` : archivePath;
            const fetchPath = (res.requestId ? res.requestId + "/" : "") + fileName;
            filePromises.push(
                fetchFileBlob(projectName, fetchPath)
                    .then(fileData => fileData.arrayBuffer())
                    .then(buffer => ({
                        path: fullPath,
                        content: new Uint8Array(buffer)
                    }))
            );
        }
    }
    return filePromises;
}

export async function downloadAllRunsAsTar(projectName, responses, toolName, durationMs, drivers, toasting, iterations, requestId) {
    console.log("TAR file streaming started.", responses);

    try {
        let allFilePromises = [];
        let metadataFile;

        if (toolName === "local SA") {
            console.log("[tarDownload] Processing lsa driver runs:", responses, projectName);
            const baselineDriver = responses.find(driver => driver.driverName === 'baseline').baselineResults;
            if (baselineDriver) {
                metadataFile = createMetadataFile(toolName, responses, durationMs, drivers, iterations, baselineDriver.requestId);
                allFilePromises.push(Promise.resolve(metadataFile));
                // Manually handle baseline since its structure is unique
                for (const fileName of baselineDriver.files) {
                    const path = (baselineDriver.requestId ? baselineDriver.requestId + "/" : "") + fileName;
                    const archivePath = `Baseline_${baselineDriver.requestId}/${fileName}`;
                    allFilePromises.push(
                        fetchFileBlob(projectName, path)
                            .then(fileData => fileData.arrayBuffer())
                            .then(buffer => ({
                                path: archivePath,
                                content: new Uint8Array(buffer)
                            }))
                    );
                }
            }

            const runs = responses.filter(driver => driver.driverName !== 'baseline');
            for (const driverObj of runs) {
                if (!driverObj.driverName || !driverObj.results) continue;
                console.log("[tarDownload] Processing driver:", driverObj.driverName, driverObj.results);
                const driverPromises = getFilesForTar(driverObj.results, projectName, `Driver_${driverObj.driverName}`);
                allFilePromises = allFilePromises.concat(driverPromises);

            }
            console.log("[tarDownload] All file promises collected:", allFilePromises.length, allFilePromises);

        } else if (toolName === "sobol GSA") {
            console.log("[tarDownload] Processing sobol GSA runs:", responses, projectName);
            metadataFile = createMetadataFile(toolName, responses, durationMs, drivers, iterations, requestId);
            allFilePromises.push(Promise.resolve(metadataFile));
            allFilePromises = allFilePromises.concat(getFilesForTar(responses.aMatrix, projectName, "A_Matrix"));
            allFilePromises = allFilePromises.concat(getFilesForTar(responses.bMatrix, projectName, "B_Matrix"));

            for (const driverObj of responses.sobolResults) {
                if (!driverObj.driverName || !driverObj.results) continue;
                const driverPromises = getFilesForTar(driverObj.results, projectName, `Driver_${driverObj.driverName}`);
                allFilePromises = allFilePromises.concat(driverPromises);
            }
        } else {
            console.log("[tarDownload] Processing simple runs:", responses, projectName);
            metadataFile = createMetadataFile(toolName, responses, durationMs, drivers, iterations, requestId);

            allFilePromises.push(Promise.resolve(metadataFile));
            allFilePromises = allFilePromises.concat(getFilesForTar(responses, projectName, ""));
        }

        console.log(`Fetching ${allFilePromises.length} files...`);
        toasting("success", "Preparing Download", `Fetching ${allFilePromises.length} simulation files. Please wait. It might take some minutes and the download might siginificantly slow down the page.`);

        const filesToAdd = await Promise.all(allFilePromises);
        toasting("success", "Preparing Download", `Fetched all ${allFilePromises.length} files. Generating Tar File. Please wait.`);
        console.log(`Fetched ${filesToAdd.length} files.`);

        console.log("All files fetched. Generating TAR file.");
        const tar = new Tar();
        const createdDirs = new Set();
        let fileCount = 0;

        for (const file of filesToAdd) {
            // pause execution
            if (fileCount % 500 === 0) {
                // control browser event loop -> no hard freeze
                await new Promise(resolve => setTimeout(resolve, 0));
                console.log(`Yielded after processing ${fileCount} files...`);
            }

            // create directory )
            const dirPath = file.path.substring(0, file.path.lastIndexOf('/'));
            if (dirPath && !createdDirs.has(dirPath)) {
                const pathParts = dirPath.split('/');
                let currentPath = '';
                for (const part of pathParts) {
                    currentPath += (currentPath ? '/' : '') + part;
                    if (!createdDirs.has(currentPath)) {
                        tar.append(`${currentPath}/`, new Uint8Array(0));
                        createdDirs.add(currentPath);
                    }
                }
            }
            // append file 
            tar.append(file.path, file.content);
            fileCount++;
        }
        console.log("TAR file created.Generating final archive.");
        const tarballUint8Array = tar.out;
        const content = new Blob([tarballUint8Array], { type: "application/x-tar" });

        console.log("TAR final archive generated. Downloading now.");
        saveAs(content, `${projectName}__${toolName.replace(" ", "_")}_${iterations}_runs.tar`);
        toasting("success", "Download Ready", `Your TAR file has been generated and is downloading.`);

    } catch (error) {
        console.error("Failed to create or download TAR file:", error);
        toasting("error", "Download Failed", "There was an error creating the TAR file.");
    }
}

/**
 * metadata file with:
 * general information, duration, iterations, and the full nested driver structure.
 */
function createMetadataFile(toolName, responses, durationMs, driverStructure, iterations, requestId = null) {
    const metadata = {
        toolName: toolName,
        durationMs: durationMs,
        driversStructure: driverStructure || [],
        requestId: requestId,
        iterations: iterations
    };
    console.log("createMetadataFile", toolName, responses, durationMs, driverStructure);
    let metadataFileName = `${toolName.replace(" ", "_").toLowerCase()}_metadata.json`;

    if (toolName === "local SA") {
        const inputInfo = responses.filter(driver => driver.driverName !== 'baseline');
        // save input data
        const lsaDriverRuns = {};
        for (const driverObj of inputInfo) {
            if (!driverObj.driverName) continue;
            lsaDriverRuns[driverObj.driverName] = {
                baseMean: driverObj.baseMean,
                inputSamples: driverObj.inputSamples
            };
        }
        metadata.inputData = lsaDriverRuns;
        metadataFileName = "lsa_analysis_metadata.json";

    } else if (toolName === "sobol GSA") {
        const sobolRuns = responses.sobolResults || [];
      
    } else { // Monte Carlo (MC) or other simple runs
       
    }


    const content = JSON.stringify(metadata, null, 4);
    return {
        path: metadataFileName, // The file name inside the TAR
        content: new Uint8Array(new TextEncoder().encode(content)) // Convert string to Uint8Array
    };
}


const parser = new DOMParser();

/**
 * parses XML + extracts activity costs.
 * 
 * @param {*} xml string
 * @returns {*} activity IDs -> avg cost
 */
export function extractCostsFromXMLString(xmlContent) {
    const fileXml = parser.parseFromString(xmlContent, "text/xml");
    return extractActivityCostsFromXML(fileXml)
}

export function extractActivityCostsFromXML(fileXml) {
    try {
        const activityContainers = fileXml.getElementsByTagName("Activity_Cost");
        const runCosts = {};

        for (const container of activityContainers) {
            const activities = container.getElementsByTagName("Activity");
            for (const activity of activities) {
                const activityId = activity.getAttribute("id");
                if (!activityId) continue;

                const avgCostElem = activity.getElementsByTagName("Activity_Average_Cost")[0];
                if (!avgCostElem) continue;

                const costValue = parseFloat(avgCostElem.textContent);
                if (!isNaN(costValue)) {
                    runCosts[activityId] = costValue;
                }
            }
        }
        return runCosts;
    } catch (e) {
        console.error("Error parsing XML content", e);
        return {}; // Return an empty object on error
    }
}