import { useState } from "react";
import React from "react";
import { Flex, Heading, SimpleGrid, Card, CardHeader, CardBody, Text, Select, Stack, Button, Progress, Box, Textarea, UnorderedList, ListItem, Grid, Divider, Center } from '@chakra-ui/react';
import { BarChart } from '@mui/x-charts/BarChart';
import { createTheme, ThemeProvider } from "@mui/material";

// import { BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, ResponsiveContainer } from "recharts";
import { getFile } from "../../../util/Storage.js";
import { AnalysisResultDiagrams } from "./AnalysisResultDiagrams.jsx";
import { ConfidenceChart } from "./ConfidenceChart.jsx";
import TornadoChart from "./TornadoChart.jsx";
import { formattedToString, extractActivityCostsFromXML } from "../analysisUtils.js"



// XML Parser vorbereiten
const parser = new DOMParser();

const customActivityOrder = [ // todo: add activity order and/or make dynamic
    'Package_product',
    'Add_protective_filling',
    'Ship_product',
    'Deliver_to_Packstation',
    'Return_product',
    'Product_returned',
    'Deliver_to_Door',
    'Print_and_post_pick-up_receipt',
    'Re-route_to_Packstation',
    'Product_delivered_sucessfully',
];


// response: array of Monte Carlo run results
export default function UncertaintyResultCard({ response, projectName, drivers }) {

    const runs = response.runs || [];
    if (!response.toolName) response.toolName = "Error: unknown analysis";
    // const runsX = Array.isArray(runs) ? runs : runs ? [runs] : [];
    // console.log("[UncertaintyResultCard] para", projectName, response, runs, drivers);
    // console.log("UncertaintyResultCard runsX:", runsX);

    // console.log("[Output Diagramms] Runs ", runs, projectName);
    const [allRuns, setAllRuns] = useState([]);
    const [deterministic, setDeterministic] = useState([]);
    const [analysisResults, setAnalysisResults] = useState([]);

    //#region initiate processing
    // runs verarbeiten wenn Component gerendert
    React.useEffect(() => {
        async function processRuns() {
            if (response.toolName === "monte carlo" || response.toolName === "deterministic") {
                await processMCRuns(runs, projectName, setDeterministic, setAnalysisResults);
                console.log("UncertaintyResultCard runs processed MC");

            } else if (response.toolName === "local SA") {
                await processLSARuns(runs, projectName, setAnalysisResults, drivers);
                console.log("UncertaintyResultCard runs processed LSA");
            } else if (response.toolName === "sobol GSA") {
                await processSobolRuns(runs, projectName, setAnalysisResults, drivers);
                console.log("UncertaintyResultCard runs processed Sobol GSA");
            }
            else {
                console.log("Unknown analysis type:", response.toolName);
            }
        }


        processRuns();
    }, [runs]);
    //#endregion

    React.useEffect(() => {
        // console.log("Deterministic updated:", deterministic);
        // console.log("[UncertaintyResultCard] Non-Deterministic updated:", analysisResults);
    }, [deterministic, analysisResults]);
    const theme = createTheme();


    //#region Render Return
    return (
        <Card bg="white">
            <CardHeader>
                <Heading size='md'>Analysis Results ({response.toolName}, {formatDuration(response.durationMs)}, Iterations: {response.iterations})</Heading>
            </CardHeader>
            <CardBody>
                <Flex direction="column" gap={6}>
                    {response.toolName === "monte carlo" || response.toolName === "deterministic" ? (
                        <div>
                            {/* Deterministic Activities Section */}
                            {deterministic.length > 0 && (
                                <Box flex={1} sx={{ minWidth: 212 }} h="700px">
                                    <Text fontWeight="bold">Deterministic Activities</Text>
                                    <UnorderedList mb={2}> {/* ml-4 aligns bullets nicely under heading */}
                                        {deterministic.slice().sort(sortCustom).map(({ name, cost }) => (
                                            <ListItem key={name}>
                                                <Text>
                                                    <Text as="span" fontWeight="semibold" color="gray.500">
                                                        {`${name.replace(/_/g, " ")}: `}
                                                    </Text>
                                                    {/* {cost.toFixed(3)} */}
                                                    {cost.toExponential(2)}
                                                </Text>
                                            </ListItem>
                                        ))}
                                    </UnorderedList>
                                    {/* <Box style={{ height: '400px', width: '100%' }}>
                                        <SimpleBarChart
                                            results={deterministic.reduce((acc, { name, cost }) => {
                                                acc[name] = cost;
                                                return acc;
                                            }, {})}
                                        />
                                    </Box> */}
                                    
                                    <Box w="60%" height="300px" >
                                        <Text fontWeight="bold" mt={0} marginLeft={"9%"}>Results of Deterministic Simulation</Text>
                                        <ThemeProvider theme={theme}>
                                            <SimpleBarChart results={deterministic.slice().sort(sortCustom).reduce((acc, a) => {
                                                acc[a.name.replaceAll(/_/g, " ")] = a.cost;
                                                return acc;
                                            }, {})} />
                                        </ThemeProvider>
                                    </Box>

                                </Box>
                            )}


                            {/* Divider - only show if BOTH sections have content */}
                            {deterministic.length > 0 && analysisResults.perAc && analysisResults.perAc.length > 0 && (
                                <Divider />
                            )}

                            {/* Distributed  Activity Costs Section */}
                            {analysisResults.perAc && analysisResults.perAc.length > 0 && (

                                <Box flex={1}>
                                    {/* Overview */}
                                    <Box display="flex" gap={6} flexWrap="wrap" >
                                        {analysisResults.totalCosts?.length > 0 && (
                                            <Box flex={1} w={{ base: "100%", md: "65%" }}>
                                                <Text fontWeight="bold" mb={2}>Total Project Cost Distribution</Text>
                                                <Text fontSize="sm" mb={4}>
                                                    This histogram and box plot represent the distribution of the final, aggregated project cost across all Monte Carlo runs.
                                                </Text>
                                                <Box
                                                    borderWidth="1px"
                                                    borderRadius="lg"
                                                    overflow="hidden"
                                                    p={4}
                                                    maxW="800px" // Adjusted for total cost to stand out
                                                >
                                                    {/* Reuse AnalysisResultDiagrams, but pass the total cost data */}
                                                    <AnalysisResultDiagrams
                                                        key="total_cost_distribution"
                                                        activity="Total Project Cost"
                                                        costs={analysisResults.totalCosts}
                                                        stats={analysisResults.totalCostsStats}
                                                        // Maybe pass a flag if AnalysisResultDiagrams needs to know it's a Total Cost
                                                        isTotalCost={true}
                                                    />
                                                    {/* Display key stats from the new totalCostsStats */}
                                                    <UnorderedList ml={4} mt={2}>
                                                        <ListItem>Mean: {formattedToString(analysisResults.totalCostsStats.mean)}</ListItem>
                                                        <ListItem>Standard Deviation: {formattedToString(analysisResults.totalCostsStats.stdev)}</ListItem>
                                                        <ListItem>95% CI: [{formattedToString(analysisResults.totalCostsStats.confInterval.lower)}, {formattedToString(analysisResults.totalCostsStats.confInterval.upper)}]</ListItem>
                                                    </UnorderedList>
                                                </Box>
                                            </Box>
                                        )}
                                        <Box w={{ base: "100%", md: "45%" }}>
                                            <Text fontWeight="bold" mb={1}>Mean Costs with 95% Confidence Interval per Activity</Text>
                                            <ConfidenceChart activityData={analysisResults.perAc.slice().sort(sortCustom)} isDarkMode={false} />
                                        </Box>
                                    </Box>
                                    <Divider mt={6} mb={6} />
                                    {/* Per activity Stats */}
                                    <Text fontWeight="bold" mb={2}>Distribution per Activity</Text>
                                    <SimpleGrid
                                        minChildWidth="400px"
                                        spacing={4}
                                    >
                                        {analysisResults.perAc.slice()
                                            .sort(sortCustom)
                                            .map(({ name, stats, costs }) => (
                                                <AnalysisResultDiagrams key={name} activity={name} costs={costs} stats={stats} />
                                            ))}
                                    </SimpleGrid>

                                    {/* Additional Charts Section */}
                                    <Box mt={6} h="min-content" >

                                        <Text fontWeight="bold" mb={2}>Comparison of Activities</Text>
                                        <Box display="flex" gap={6}>


                                            <Box w="55%" h="450px" mb={4}>
                                                <Text fontWeight="bold" mb={2}>Standard Error of the Mean (SEM) per Activity</Text>
                                                <Text fontWeight="normal" mb={2}>Mean of SEM: {formattedToString(meanOfSEM(analysisResults.perAc))}</Text>
                                                <ThemeProvider theme={theme}>
                                                    <SimpleBarChart results={analysisResults.perAc.slice().sort(sortCustom).reduce((acc, a) => {
                                                        acc[a.name.replaceAll(/_/g, " ")] = a.stats.sem;
                                                        return acc;
                                                    }, {})} />
                                                </ThemeProvider>

                                            </Box>
                                            {/* coefficient of variation (CV): removed because no use */}
                                            {/* <Box w="55%" h="450px"> 
                                                <Text fontWeight="bold" mb={2}> coefficient of variation (CV) per Activity</Text>
                                                <ThemeProvider theme={theme}>
                                                    <SimpleBarChart results={analysisResults.perAc.reduce((acc, a) => {
                                                        acc[a.name.replaceAll(/_/g, " ")] = coefficientVariation(a.stats);
                                                        return acc;
                                                    }, {})} />
                                                </ThemeProvider>
                                            </Box> */}


                                        </Box>


                                    </Box>
                                </Box>
                            )}
                        </div>
                    ) : response.toolName === "local SA" ? (
                        <Box>
                            <Text fontWeight="bold" mb={2}>Tornado Chart of Overall Cost Sensitivity relative to Input Drivers in Percentage</Text>
                            <Box w="80%" h="300px">
                                {analysisResults.overallSensitivities !== undefined && Object.keys(analysisResults.overallSensitivities).length > 0 &&
                                    <TornadoChart  {... { sensitivityValues: analysisResults.overallSensitivities, darkMode: false, name: "Overall Costs" }} />
                                }
                            </Box>
                            <Divider />
                            <Text fontWeight="bold" mb={2}>Normalized sensitivity coefficient plot</Text>
                            <Box w="80%" h="300px">
                                {analysisResults.normalizedOverallSensitivities !== undefined && Object.keys(analysisResults.normalizedOverallSensitivities).length > 0 &&
                                    <TornadoChart  {... { sensitivityValues: analysisResults.normalizedOverallSensitivities, darkMode: false, name: "Normalized Overall Sensitivities" }} />
                                }
                            </Box>
                            <Divider mt={6} mb={6} />
                            <Text fontWeight="bold" mb={2}>Sensitivities per Activity relative to Input Drivers </Text>
                            <Flex wrap="wrap" gap={6} mt={6}>
                                {analysisResults.overallSensitivities !== undefined && Object.entries(analysisResults.sensitivitiesPerActivity).sort(sortCustom).map(([driverName, value]) => (
                                    <Box w="30%" h="300px" key={driverName} mb={6} >
                                        <TornadoChart {...{ sensitivityValues: value, darkMode: false, name: driverName.replaceAll(/_/g, " ") }} />
                                    </Box>
                                ))}

                            </Flex>

                        </Box>
                    ) : response.toolName === "sobol GSA" ? (

                        <Box>
                            <Box w="100%" h="250px" mx="auto" >
                                <Text fontWeight="bold" mb={2}>Variance Closure Check: Sum of First-Order Indices (∑Sᵢ) vs. 100%</Text>
                                {analysisResults.firstOrder !== undefined && (
                                    <Box w="100%" >
                                        <ThemeProvider theme={theme}>
                                            <VarianceClosureChart
                                                data={createVarianceClosureDataset(analysisResults.firstOrder)} h={200}
                                            />
                                        </ThemeProvider>
                                        <Text fontSize="sm">
                                            Mean of ∑Sᵢ across activities: {analysisResults?.varianceClosure?.toFixed(3) ?? 'N/A'}
                                        </Text>
                                    </Box>
                                )}

                            </Box>
                            <Divider mt={6} mb={6} />
                            <Text fontWeight="bold" mb={2}>Aggregated First-Order Indices </Text>
                            <Text fontSize="sm" mb={4}>
                                The direct, non-interactive variance contribution of each input driver across all activities.
                            </Text>
                            <Box w="80%" h="350px" mx="auto">
                                {analysisResults.firstOrder !== undefined && (
                                    <ThemeProvider theme={theme}>
                                        {/* Reuse SimpleBarChart or implement BarChart directly */}
                                        <SimpleBarChart
                                            results={aggregateSobolIndices(analysisResults.firstOrder)}
                                            height={300}
                                        />
                                    </ThemeProvider>
                                )}
                            </Box>

                            <Divider mt={6} mb={6} />
                            <Text fontWeight="bold" mb={2}>Aggregated Total-Order Indices </Text>
                            <Text fontSize="sm" mb={4}>
                                The total variance contribution (direct + interaction) of each input driver across all activities.
                            </Text>
                            <Box w="80%" h="350px" mx="auto">
                                {analysisResults.totalOrder !== undefined && (
                                    <ThemeProvider theme={theme}>
                                        {/* Reuse SimpleBarChart or implement BarChart directly */}
                                        <SimpleBarChart
                                            results={aggregateSobolIndices(analysisResults.totalOrder)}
                                            height={300}
                                        />
                                    </ThemeProvider>
                                )}
                            </Box>

                            <Divider mt={6} mb={6} />
                            <Text fontWeight="bold" mb={2}>First-Order (Sᵢ) vs. Total-Order (Sₜᵢ) Indices per Activity</Text>
                            {analysisResults.firstOrder && analysisResults.totalOrder &&
                                <Flex wrap="wrap" gap={6} mt={6}>
                                    {Object.keys(analysisResults.firstOrder).sort((aName, bName) => sortCustom([aName], [bName])).map(activityName => {
                                        const chartData = createSobolComparisonDataset(
                                            activityName,
                                            analysisResults.firstOrder,
                                            analysisResults.totalOrder
                                        );

                                        return (
                                            <Box w="40%" h="250px" key={activityName}>
                                                <Text fontWeight="medium" mt={1}>{activityName.replaceAll(/_/g, " ")}</Text>
                                                <ThemeProvider theme={theme}>
                                                    <SobolComparisonChart data={chartData} h={250} />
                                                </ThemeProvider>
                                            </Box>
                                        );
                                    })}
                                </Flex>
                            }
                            <Divider mb={6} mt={6} />
                            <Text fontWeight="bold" mb={2}>First Order Indices per Activity </Text>
                            {analysisResults.firstOrder !== undefined && (
                                <Flex wrap="wrap" gap={6} mt={6}>
                                    {Object.entries(analysisResults.firstOrder).sort(sortCustom)
                                        .map(([activityName, activitiesDrivers]) => {
                                            // Filter out negative/too-small values
                                            const filteredDrivers = Object.fromEntries(
                                                Object.entries(activitiesDrivers).map(([driver, value]) => [
                                                    driver,
                                                    Math.max(0, value) // clamp negatives to 0
                                                ])
                                            );

                                            return (
                                                <Box w="40%" h="250px" key={activityName}>
                                                    <Text fontWeight="medium" mb={2}>
                                                        {activityName.replaceAll(/_/g, " ")}
                                                    </Text>
                                                    <ThemeProvider theme={theme}>
                                                        <SimpleBarChart results={filteredDrivers} />
                                                    </ThemeProvider>
                                                </Box>
                                            );
                                        })}
                                </Flex>
                            )}

                            <Divider mt={6} mb={6} />

                            <Text fontWeight="bold" mb={2}>Total Order Indices per Activity </Text>
                            {analysisResults.totalOrder !== undefined && <Flex wrap="wrap" gap={6} mt={6}>
                                {
                                    Object.entries(analysisResults.totalOrder).sort(sortCustom).map(([activityName, activitiesDrivers]) => {
                                        // Filter out the categories where the value is 0
                                        const filteredEntries = Object.entries(activitiesDrivers).filter(([, value]) => value !== 0);
                                        const filteredResults = Object.fromEntries(filteredEntries);
                                        if (Object.keys(filteredResults).length === 0) return null;

                                        return (
                                            <Box w="30%" h="250px">
                                                <Text fontWeight="medium" mb={2}>{activityName.replaceAll(/_/g, " ")}</Text>
                                                <ThemeProvider theme={theme}>
                                                    <SimpleBarChart results={filteredResults} />
                                                </ThemeProvider>
                                            </Box>
                                        )
                                    })
                                }
                            </Flex>
                            }

                            <Divider mt={6} mb={6} />
                            {/* Interaction Indices */}
                            <Text fontWeight="bold" mb={2}>Interaction Indices per Activity </Text>
                            {analysisResults.totalOrder !== undefined && <Flex wrap="wrap" gap={6} mt={6}>
                                {
                                    Object.entries(analysisResults.interaction).sort(sortCustom).map(([activityName, activitiesDrivers]) => {
                                        // Filter out the categories where the value is 0
                                        const filteredEntries = Object.entries(activitiesDrivers).filter(([, value]) => value !== 0);
                                        const filteredResults = Object.fromEntries(filteredEntries);
                                        if (Object.keys(filteredResults).length === 0) return null;

                                        return (
                                            <Box w="30%" h="250px">
                                                <Text fontWeight="medium" mb={2}>{activityName.replaceAll(/_/g, " ")}</Text>
                                                <ThemeProvider theme={theme}>
                                                    <SimpleBarChart results={filteredResults} />
                                                </ThemeProvider>
                                            </Box>
                                        )
                                    })
                                }
                            </Flex>
                            }
                            <Divider mt={6} mb={6} />
                            <Text fontWeight="bold" mb={2}>Driver Sensitivity Across All Activities</Text>
                            {analysisResults.firstOrderPerDriver !== undefined && Object.entries(analysisResults.firstOrderPerDriver)?.map(([driverName, activitySi]) => {
                                // Combine Si and STi for this specific driver across all activities
                                const combinedData = Object.entries(activitySi).sort(sortCustom).map(([activity, Si]) => ({
                                    driver: activity.replaceAll(/_/g, " "),
                                    Si: Si,
                                    STi: analysisResults.totalOrderPerDriver[driverName][activity] || 0, // Ensure STi is available
                                }));

                                return (
                                    <Box w="45%" h="350px" key={`driver-comp-${driverName}`}>
                                        <Text fontWeight="medium" mb={2}>{driverName.replaceAll(/_/g, " ")}</Text>

                                        <ThemeProvider theme={theme}>
                                            <SobolComparisonChart
                                                data={combinedData}
                                                activityName={driverName}
                                            />
                                        </ThemeProvider>
                                    </Box>
                                );
                            })}


                        </Box>
                    ) : (
                        <Text>Unknown analysis type: {response.toolName}</Text>
                    )

                    }


                </Flex>
            </CardBody>

        </Card>
    );
    //#endregion
}




//#region Processing Functions
async function processMCRuns(runs, projectName, setDeterministic, setAnalysisResults) {
    const allRuns = [];
    for (const run of runs) {
        if (run.error) continue;
        const runCosts = await extractActivityCosts(run, projectName);
        allRuns.push({
            requestId: run.requestId,
            costs: runCosts
        });
    }
    // console.log("[Output Diagramms] All Runs ", allRuns);
    const totalCostsArray = calculateTotalCosts(allRuns);
    const perActivityCosts = aggregateCosts(allRuns);
    // console.log("[Output Diagramms] Per Activity Costs ", perActivityCosts, totalCostsArray);
    const activityStats = Object.fromEntries(Object.entries(perActivityCosts).map(([activity, values]) => [activity, stats(values)]))
    // console.log("[Output Diagramms] Activity Stats ", activityStats);

    const det = [];
    const nonDet = [];

    for (const [activity, s] of Object.entries(activityStats)) {
        if (s.deterministic) det.push({ name: activity, cost: s.mean });
        else {
            const values = perActivityCosts[activity];
            // console.log("[Output Diagramms] Activity", activity, "values", values);
            nonDet.push({ name: activity, stats: s, costs: values });
        }
    }

    det.sort((a, b) => a.name.localeCompare(b.name));
    nonDet.sort((a, b) => a.name.localeCompare(b.name));
    setDeterministic(det);
    setAnalysisResults({
        perAc: nonDet,
        totalCosts: totalCostsArray,
        totalCostsStats: stats(totalCostsArray)
    });
}



async function processLSARuns(results, projectName, setAnalysisResults, drivers) {
    const baselineDriver = results.find(driver => driver.driverName === 'baseline');
    // console.log("processLSARuns baselineDriver", baselineDriver, projectName);
    let baseCosts = await extractActivityCosts(baselineDriver.baselineResults, projectName); // change this immediatly in analysis logic
    baseCosts = aggregateCosts([{ costs: baseCosts }]);
    // Filter out the baseline object to create a new array
    const runs = results.filter(driver => driver.driverName !== 'baseline');
    // console.log("processLSARuns", runs, projectName);

    const runsPerDriver = {};
    const resultsPerDriver = {};
    for (let idx = 0; idx < runs.length; idx++) { // iterate over each varied driver's runs
        const driver = runs[idx];
        // console.log("Processing lsa driver runs:", driver, projectName);
        runsPerDriver[driver.driverName] = [];
        for (const run of driver.results) {
            // console.log("Processing run:", run.requestId, run);
            if (run.error) continue;

            const runCosts = await extractActivityCosts(run, projectName);
            // console.log("Run costs:", runCosts);
            runsPerDriver[driver.driverName].push({
                requestId: run.requestId,
                costs: runCosts
            });
        }
        const aggCosts = aggregateCosts(runsPerDriver[driver.driverName]);
        // console.log("[Output Diagramms] Per Activity Costs ", runsPerDriver[driver.driverName], Object.entries(runsPerDriver[driver.driverName]));
        const activityStats = Object.fromEntries(Object.entries(aggCosts).map(([activity, values]) => [activity, stats(values)]))
        const activitySensitivities = computeActivitySensitivities(baseCosts, activityStats);
        const inputStats = stats(driver.inputSamples);
        resultsPerDriver[driver.driverName] = {
            "costs": aggCosts,
            "stats": activityStats,
            "sensitivities": activitySensitivities,
            "inputMean": inputStats.mean,
            "baseMean": driver.baseMean
        };

    }
    runsPerDriver["baseline"] = baseCosts;
    // console.log("[ARC] All LSA Runs ", runsPerDriver, resultsPerDriver);

    const overallCosts = aggregateOverallDriverCosts(resultsPerDriver);
    const baselineOverallCosts = Object.values(baseCosts).map(arr => arr.reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0);
    // console.log("[ARC] Baseline Overall Costs ", baseCosts, baselineOverallCosts, overallCosts);

    // overallCosts.mapValues(c => c - baselineOverallCosts);
    const overallSensitivities = Object.fromEntries(
        Object.entries(overallCosts).map(([driver, value]) => {
            const sensitivity = baselineOverallCosts !== 0
                ? (value / baselineOverallCosts - 1) * 100 //(value - baselineOverallCosts) / baselineOverallCosts 
                : 0;
            return [driver, sensitivity];
        }));// relative change / ratio-based sensitivity


    const normalizedOverallSensitivities = await normalizeSensitivities(resultsPerDriver, baseCosts, overallCosts);

    console.log("[ARC] lsa: Overall Costs per Driver ", overallCosts, baselineOverallCosts, overallSensitivities, normalizedOverallSensitivities);

    const sensitivitiesPerActivity = reverseMapping(resultsPerDriver, "sensitivities");
    // console.log("[ARC] Sensitivities per Activity ", sensitivitiesPerActivity, getDriversWithValue(sensitivitiesPerActivity));
    setAnalysisResults({
        resultsPerDriver,
        sensitivitiesPerActivity,
        overallSensitivities,
        normalizedOverallSensitivities
    });

}


export async function processSobolRuns(results, projectName, setAnalysisResults, drivers) {
    if (!results || !results.aMatrix || !results.bMatrix || !results.sobolResults) {
        console.error("Invalid results for Sobol analysis.", results);
        return;
    }
    // console.log("Starting Sobol GSA processing...", results);

    // Process A and B matrices to get activity costs.
    const costsA = await processMatrix(results.aMatrix, projectName);
    const costsB = await processMatrix(results.bMatrix, projectName);

    // Process A_iB matrices for each driver.
    const costsAiB = {};
    for (const sobolResult of results.sobolResults) {
        costsAiB[sobolResult.driverName] = await processMatrix(sobolResult.results, projectName);
    }

    // console.log("Extracted costs from all matrices.", { costsA, costsB, costsAiB });


    const firstOrderIndices = {};
    const totalOrderIndices = {};
    const interactionIndices = {};
    const allActivities = new Set([...Object.keys(costsA), ...Object.keys(costsB)]);

    // sobol indices for each activity
    for (const activity of allActivities) {
        if (!costsA[activity] || !costsB[activity]) {
            console.warn(`Skipping activity '${activity}' due to missing data in A or B matrix.`);
            continue;
        }

        const numRuns = costsA[activity].length;
        if (numRuns === 0) continue;
        const totalVariance = stats([...costsA[activity], ...costsB[activity]]).variance;
        if (totalVariance === 0) {
            console.warn(`Total variance is zero for activity '${activity}'. Skipping Sobol index calculation.`);
            continue;
        }
        firstOrderIndices[activity] = {};
        totalOrderIndices[activity] = {};
        interactionIndices[activity] = {};

        for (const driver of drivers) {
            const driverName = driver.name;
            const costsForDriver = costsAiB[driverName];
            if (!costsForDriver || !costsForDriver[activity]) {
                console.warn(`Skipping driver '${driverName}' for activity '${activity}' due to missing data.`);
                continue;
            }
            // first order index
            const firstOrderNumerator = costsForDriver[activity].reduce((sum, yAiB, i) => {
                const yA = costsA[activity][i];
                const yB = costsB[activity][i];
                return sum + yB * (yAiB - yA);   // Y_B * (Y_AiB - Y_A)
            }, 0) / numRuns;


            const rawFirstOrder = firstOrderNumerator / totalVariance;
            const firstOrder = Math.max(0, rawFirstOrder);

            //total order index (S_Ti)
            const totalOrderNumerator = costsForDriver[activity].reduce((sum, cost, i) => {
                const diff = costsA[activity][i] - cost;
                return sum + diff * diff;
            }, 0) / (2 * numRuns);
            const rawTotalOrder = totalOrderNumerator / totalVariance;
            const totalOrder = Math.max(0, rawTotalOrder);

            // interaction index
            const rawInteractionIndex = totalOrder - firstOrder;
            const finalInteractionIndex = Math.max(0, rawInteractionIndex); // This clamps it at 0

            // store finalInteractionIndex
            interactionIndices[activity][driverName] = finalInteractionIndex;
            firstOrderIndices[activity][driverName] = firstOrder;
            totalOrderIndices[activity][driverName] = totalOrder;

        }
    }
    console.log("Sobol indices computed:", { firstOrderIndices, totalOrderIndices }, reverseMappingAtoD(firstOrderIndices), Object.entries(getDriversWithValue(firstOrderIndices)),);
    checkSobolRanges(firstOrderIndices, totalOrderIndices, interactionIndices);
    let variance_closure = checkVarianceClosure(firstOrderIndices);


    setAnalysisResults({
        firstOrder: firstOrderIndices,
        totalOrder: totalOrderIndices,
        interaction: interactionIndices,
        firstOrderPerDriver: reverseMappingAtoD(firstOrderIndices),
        totalOrderPerDriver: reverseMappingAtoD(totalOrderIndices),
        varianceClosure: variance_closure
    });

    // console.log("comparison set", createSobolComparisonDataset)
}



//#endregion




//#region Data Extraction and Aggregation

async function extractActivityCosts(run, projectName) {
    if (run.files) {
        const statFileName = run.files.find((f) => f.endsWith("_statistic.xml"));
        if (!statFileName) return {};

        const filePath = (run.requestId ? run.requestId + "/" : "") + statFileName;
        const fileData = await getFile(projectName, filePath);


        const fileXml = parser.parseFromString(fileData?.data, "text/xml");
        const runCosts = extractActivityCostsFromXML(fileXml);
        return runCosts
    } else if (run.fileName?.endsWith("_statistic.xml")) {
        // console.log("File data length:", run);
        return run.extractedData
    }
    else {
        return {};
    }


}


/* Aggregate costs per activity across all runs */
/**
 * 
 * @param  needs run.costs.activities
 * @returns 
 */
function aggregateCosts(runs) {
    const result = {};

    runs.forEach(run => {
        const costs = run.costs;
        for (const activity in costs) {
            if (!result[activity]) result[activity] = [];
            result[activity].push(costs[activity]); // <— directly push the number
        }
    });

    return result;
}


function aggregateOverallDriverCosts(drivers) {
    const result = {};

    for (const driver in drivers) {
        const activities = drivers[driver].costs;
        const activityNames = Object.keys(activities);
        if (activityNames.length === 0) continue;

        // Assume all arrays are same length
        const numRuns = activities[activityNames[0]].length;
        const totalPerRun = Array(numRuns).fill(0);

        // Sum costs per run across activities
        for (const activity of activityNames) {
            const costs = activities[activity];
            for (let i = 0; i < numRuns; i++) {
                totalPerRun[i] += costs[i];
            }
        }

        // Calculate mean across runs
        const meanTotal = totalPerRun.reduce((a, b) => a + b, 0) / numRuns;
        result[driver] = meanTotal;
    }

    console.log("[aggregateOverallDriverCosts] Overall driver costs:", result);
    return result;
}

/**
 *  aggregates sobol indices across activities for each driver
 */
const aggregateSobolIndices = (indicesPerActivity) => {
    const aggregated = {};

    // Iterate through activities
    for (const activityName in indicesPerActivity) {
        const drivers = indicesPerActivity[activityName];

        // Iterate through drivers within each activity
        for (const driverName in drivers) {
            const indexValue = drivers[driverName];

            if (!aggregated[driverName]) {
                aggregated[driverName] = 0;
            }

            // Sum the index values across activities
            aggregated[driverName] += indexValue;
        }
    }
    return aggregated;
};


/**
 * total cost for each run in MC analysis
 */
function calculateTotalCosts(runs) {
    return runs.map(run => {
        // Sum the costs across all activities for this single run
        return Object.values(run.costs).reduce((total, cost) => total + cost, 0);
    });
}


const processMatrix = async (matrix, projectName) => {
    const allRuns = [];
    for (const run of matrix) {
        if (run.error) continue;
        // console.log("Processing run:", run.requestId, run);
        const runCosts = await extractActivityCosts(run, projectName);
        allRuns.push({
            requestId: run.requestId,
            costs: runCosts
        });
    }
    return aggregateCosts(allRuns);
};


/**
 * Reverse mapping from driver->activity->value to activity->driver->value
 */
function reverseMapping(resultsPerDriver, key) {
    const perActivity = {};
    for (const [driver, payload] of Object.entries(resultsPerDriver)) {
        const sens = (payload && payload[key]) || {};
        for (const [activity, value] of Object.entries(sens)) {
            if (!perActivity[activity]) perActivity[activity] = {};
            perActivity[activity][driver] = value;
        }
    }
    return perActivity;
}



function reverseMappingAtoD(resultsPerDriver) {
    let result = {};
    for (const [act, actDrivers] of Object.entries(resultsPerDriver)) {
        // console.log("reverseMappingAtoD", act, actDrivers);

        for (const [driver, value] of Object.entries(actDrivers)) {
            if (!result[driver]) {
                result[driver] = {};
            }
            result[driver][act] = value;
        }
    }
    return result;
}


/**
 *  ilter out drivers with zero value across all activities
 * @param {*} activityData 
 * @returns 
 */
function getDriversWithValue(activityData) {
    const result = {};

    for (const activity in activityData) {
        const drivers = activityData[activity];
        const nonZeroDrivers = {};

        for (const driver in drivers) {
            if (drivers[driver] !== 0) {
                nonZeroDrivers[driver] = drivers[driver];
            }
        }

        result[activity] = nonZeroDrivers;
    }

    return result;
}

//#endregion Data Extraction and Aggregation




//#region Statistical & Mathematical Helpers
/**
 * Function that calculates statistics for every activity's result
 * @param {*} arr 
 * @returns 
 */
function stats(arr) {
    const n = arr.length;
    const min = Math.min(...arr);
    const max = Math.max(...arr);
    const deterministic = min === max;
    const mean = arr.reduce((s, v) => s + v, 0) / n;
    const variance = arr.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
    const stdev = Math.sqrt(variance);
    let sem = NaN;
    if (n > 1) sem = stdev / Math.sqrt(n);
    const confInterval = calculateConfidenceInterval(mean, stdev, n);

    return { count: n, mean, variance, stdev, min, max, deterministic, sem, confInterval };
}

function meanOfSEM(results) {
    // console.log("Sem mean from results", results)
    const allSEMs = results.map(a => a.stats.sem);
    const sumOfSEMs = allSEMs.reduce((sum, sem) => sum + sem, 0);
    const numberOfActivities = allSEMs.length;
    const meanOfSEM = sumOfSEMs / numberOfActivities;
    // console.log("Mean of SEM:", meanOfSEM);
    return meanOfSEM
}

function calculateConfidenceInterval(mean, stdev, n) {
    if (n <= 1) {
        return NaN; // Not enough data to calculate confidence interval
    }

    const z = 1.96; // 95% confidence level (normal distribution)
    const marginOfError = z * (stdev / Math.sqrt(n)); // change to sem 

    return {
        lower: mean - marginOfError,
        upper: mean + marginOfError
    };
}

/**
 * calculates elasticity
 */
async function normalizeSensitivities(resultsPerDriver, baseCosts, overallCosts) {
    const normalizedOverallSensitivities = {};
    const baselineOverallCosts = Object.values(baseCosts).map(arr => arr.reduce((a, b) => a + b, 0)).reduce((a, b) => a + b, 0);

    for (const [driverName, results] of Object.entries(resultsPerDriver)) {
        const overallCostMean = overallCosts[driverName];
        const X_base = results.baseMean;
        const X_varied_mean = results.inputMean;

        // 1. Calculate Delta Y and Delta X
        const Delta_Y = overallCostMean - baselineOverallCosts;
        const Delta_X = X_varied_mean - X_base;

        // Safety check against zero division
        if (baselineOverallCosts === 0 || Delta_X === 0 || X_base === 0) {
            normalizedOverallSensitivities[driverName] = 0; // Or handle as required
        } else {
            // 2. Calculate Normalized Sensitivity Coefficient (NSC)
            const normalizedSensitivity = (Delta_Y / baselineOverallCosts) / (Delta_X / X_base);
            normalizedOverallSensitivities[driverName] = normalizedSensitivity;
        }
    }
    return normalizedOverallSensitivities
}


/**
 * per activity  relative change from baseline and perturbed costs
 */
function computeActivitySensitivities(baselineCosts, statsPerActivity) {
    const sensitivities = {};
    const EPSILON = 1e-14;

    for (const activity of Object.keys(baselineCosts)) {
        const baseValue = baselineCosts[activity][0];
        const pertValue = statsPerActivity[activity].mean;
        // console.log("Computing sensitivity for activity:", activity, "baseValues:", baseValue, "pertValues:", pertValue);

        // Compute element-wise differences
        let diffValue = (pertValue - baseValue) / baseValue * 100;
        if (Math.abs(diffValue) < EPSILON) diffValue = 0;

        // Compute stats for these differences
        sensitivities[activity] = diffValue;
    }

    return sensitivities;
}

function coefficientVariation(stats) {
    const { stdev, mean } = stats;
    return stdev / mean;
}


//#endregion Statistical & Mathematical Helpers



//#region Validation helpers
function checkSobolRanges(firstOrder, totalOrder) {
    const warnings = [];

    for (const activity of Object.keys(firstOrder)) {
        for (const driver of Object.keys(firstOrder[activity])) {
            const S1 = firstOrder[activity][driver];
            const ST = totalOrder?.[activity]?.[driver];

            if (!Number.isFinite(S1)) {
                warnings.push(`${activity}/${driver}: first-order index is NaN or infinite.`);
            } else if (S1 < -0.05 || S1 > 1.05) {
                warnings.push(`${activity}/${driver}: first-order index out of expected range (${S1.toFixed(3)}).`);
            }

            if (ST !== undefined) {
                if (!Number.isFinite(ST)) {
                    warnings.push(`${activity}/${driver}: total-order index is NaN or infinite.`);
                } else if (ST < -0.05 || ST > 1.05) {
                    warnings.push(`${activity}/${driver}: total-order index out of expected range (${ST.toFixed(3)}).`);
                } else if (ST < S1 - 0.02) {
                    warnings.push(`${activity}/${driver}: total-order smaller than first-order (check sampling).`);
                }
            }
        }
    }

    if (warnings.length === 0) console.log("Sobol range check: all indices in expected bounds");
    else console.warn("Sobol range problem:\n" + warnings.join("\n"));
}


function checkVarianceClosure(firstOrder) {
    const results = [];

    for (const activity of Object.keys(firstOrder)) {
        const sumS1 = Object.values(firstOrder[activity]).filter(v => Number.isFinite(v)).reduce((a, b) => a + b, 0);
        results.push({ activity, sumFirstOrder: sumS1 });
    }

    console.table(results.map(r => ({ Activity: r.activity,
        "∑S1": r.sumFirstOrder.toFixed(3),
        Note:r.sumFirstOrder < 0.8 ? "low (missing variance)" :
        r.sumFirstOrder > 1.2 ? "high (overcounted)" : "ok"
    })));

    const mean = results.reduce((a, b) => a + b.sumFirstOrder, 0) / results.length;
    console.log(`Mean ∑S1 across activities: ${mean.toFixed(3)}`);
    return mean
}

/**
 * Checks convergence of Monte Carlo results by tracking rolling mean and variance.
 * @param {[]} samples  output arrey from MC
 * @param {number} step Interval for calculating stats
 */
export function checkMCConvergence(samples, step = 50) {
    if (!samples || samples.length < step * 2) {
        throw new Error("Insufficient sample size for convergence check.");
    }

    const convergenceData = [];
    for (let i = step; i <= samples.length; i += step) {
        const subset = samples.slice(0, i);
        const mean =
            subset.reduce((sum, val) => sum + val, 0) / subset.length;
        const variance =
            subset.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
            (subset.length - 1);
        convergenceData.push({ n: i, mean, variance });
    }

    // Compare last few windows for stability
    const last = convergenceData.slice(-3);
    const meanDiff =
        Math.abs(last[2].mean - last[0].mean) / Math.abs(last[0].mean);
    const varDiff =
        Math.abs(last[2].variance - last[0].variance) / Math.abs(last[0].variance);

    const stable = meanDiff < 0.01 && varDiff < 0.05; // 1% mean, 5% variance tolerance

    return { stable, convergenceData };
}


/**
 * Calculates total interaction effect of Sobol
 * @param {[]} firstOrder first order Sobol I
 * @param {[]} totalOrder total order Solol I
 */
export function checkInteractionSignificance(firstOrder, totalOrder) {
    if (!firstOrder || !totalOrder || firstOrder.length !== totalOrder.length) {
        throw new Error("Input arrays must have same length.");
    }

    const interactionEffects = totalOrder.map(
        (st, i) => Math.max(st - firstOrder[i], 0)
    );

    const sumFirst = firstOrder.reduce((a, b) => a + b, 0);
    const sumTotal = totalOrder.reduce((a, b) => a + b, 0);
    const sumInteractions = interactionEffects.reduce((a, b) => a + b, 0);

    const interactionShare = (sumInteractions / sumTotal) * 100;
    const additive = interactionShare < 5; // threshold for "mostly additive" model

    return { interactionShare, additive };
}

//#endregion Validation helpers


//#region Data Charting Prep
const createSobolComparisonDataset = (activityName, firstOrder, totalOrder) => {
    const drivers = Object.keys(firstOrder[activityName] || {});
    return drivers.map(driver => ({
        driver: driver.replaceAll(/_/g, " "),
        Si: firstOrder[activityName][driver],
        STi: totalOrder[activityName][driver],
    }));
};



/**
 * prep data for Variance Closure Chart
 * @param {} firstOrder analysisResults.firstOrder object ({ activity: { driver: Si } }).
 */
const createVarianceClosureDataset = (firstOrder) => {
    const data = [];

    for (const [activityName, drivers] of Object.entries(firstOrder)) {
        // Calculate the sum of all first-order indices for this activity
        const sumSi = Object.values(drivers)
            .filter(v => Number.isFinite(v) && v >= 0) // Filter out NaNs and ensure non-negative for sum
            .reduce((sum, Si) => sum + Si, 0);

        // Interaction contribution is the residual variance (1 - sumSi)
        const interaction = Math.max(0, 1.0 - sumSi);

        data.push({
            activity: activityName.replaceAll(/_/g, " "),
            sumSi: Math.min(1.0, sumSi), // Cap sumSi at 1.0 for clean stacking
            interaction: interaction,
            rawSumSi: sumSi // Store raw sum for context (if > 1.0)
        });
    }

    // Sort the activities based on custom order (optional, but helpful for consistency)
    return data.sort((a, b) => sortCustom([a.activity], [b.activity]));
};

function formatDuration(durationMs, includeFractional = false) {
    if (durationMs === undefined || durationMs === null) return "time: N/A";
    const totalSeconds = durationMs / 1000;
    // console.log("ARC: formatDuration", durationMs, totalSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = includeFractional
        ? (totalSeconds % 60).toFixed(2)
        : Math.floor(totalSeconds % 60);

    if (minutes === 0) return `${seconds} sec`;
    else return `${minutes} min ${seconds} sec`;
}



const truncatedData = (arr) => arr.map(item => {
    if (item.length > 18) {
        return item.substring(0, 15) + '...';
    }
    return item;
});

// const sortCustom = ([aName], [bName]) => customActivityOrder.indexOf(aName) - customActivityOrder.indexOf(bName)

const sortCustom = (a, b) => {
    const aName = Array.isArray(a) ? a[0] : a.name;
    const bName = Array.isArray(b) ? b[0] : b.name;
    const aIndex = customActivityOrder.indexOf(aName);
    const bIndex = customActivityOrder.indexOf(bName);
    // sort by custom order
    const aSortIndex = (aIndex === -1) ? customActivityOrder.length : aIndex;
    const bSortIndex = (bIndex === -1) ? customActivityOrder.length : bIndex;
    if (aSortIndex !== bSortIndex) {
        return aSortIndex - bSortIndex;
    }
    // if indices same, fall back to alphabetical sorting
    return aName.localeCompare(bName);
};

//#endregion Data Charting Prep




//#region Chart Components
const SimpleBarChart = ({ results, width = 500, height = 400 }) => {

    // console.log("SimpleBarChart", results);
    const chartData = Object.entries(results).map(([key, value]) => ({
        category: key,
        value: value,
    }));

    return (
        <Box height="100%" width="100%">
            <BarChart
                // width={width}
                // height={height}
                height={280}
                dataset={chartData}
                xAxis={[
                    {
                        data: Object.keys(results),
                        scaleType: "band",
                        tickMinStep: 0,
                        tickLabelStyle: {
                            angle: -35, // Rotates labels by -45 degrees
                            textAnchor: 'end', // Aligns the text to the end of the label
                            fontSize: 10, // Optional: Adjust font size for better fit
                        },
                        valueFormatter: (value, context) => {
                            if (context.location === 'tick') {
                                return truncatedData([value])[0];
                            }
                            return value;
                        },

                    },
                ]}
                yAxis={[
                    {
                        valueFormatter: (value) => {
                            // Check if the value is a number before calling toExponential
                            if (typeof value === 'number') {
                                if (value === 0) return "0";
                                return formattedToString(value); // value.toExponential(2);
                            }
                            return value;
                        },
                    },
                ]}

                series={[
                    {
                        data: Object.values(results),
                        name: "1. Order Indices",
                        minBarSize: 2, // Ensures a minimum bar height of 2 pixels
                        valueFormatter: (value) => {
                            return formattedToString(value);

                        },
                    },
                ]}
                margin={{
                    bottom: 100,
                    left: 90,
                    top: 10
                }}
            />
        </Box>
    );
}



const SobolComparisonChart = ({ data, activityName }) => {
    // Extract drivers for the X-axis 
    const drivers = data.map(d => d.driver);

    return (
        <Box height="100%" width="100%">
            <BarChart
                dataset={data}
                xAxis={[
                    {
                        data: drivers,
                        scaleType: "band",
                        tickMinStep: 0,
                        tickLabelStyle: {
                            angle: -35,
                            textAnchor: 'end',
                            fontSize: 10,
                        },
                        valueFormatter: (value, context) => {
                            if (context.location === 'tick') {
                                return truncatedData([value])[0];
                            }
                            return value;
                        },
                    },
                ]}
                yAxis={[
                    {
                        label: 'Sobol Index Value',
                        labelStyle: {
                            transform: 'rotate(0deg) translate(0, -62px)',
                            textAlign: 'center',
                            fontSize: '14px',
                            fontWeight: 'normal',
                        },
                        valueFormatter: (value) => formattedToString(value),
                    },
                ]}
                series={[
                    {
                        dataKey: 'Si', // Uses the 'Si' key from the 'dataset'
                        label: "First-Order (Sᵢ)",
                        valueFormatter: (value) => formattedToString(value),
                        color: '#4299E1', // Blue
                    },
                    {
                        dataKey: 'STi', // Uses the 'STi' key from the 'dataset'
                        label: "Total-Order (Sₜᵢ)",
                        valueFormatter: (value) => formattedToString(value),
                        color: '#38B2AC', // Teal
                    },
                ]}
                margin={{
                    bottom: 100,
                    left: 90,
                    right: 10
                }}
                height={250}
                slotProps={{
                    legend: {
                        direction: 'row',
                        position: { vertical: 'top', horizontal: 'right' },
                        padding: 0,
                        labelStyle: {
                            fontSize: 14,
                        },
                    },
                }}
            />
        </Box>
    );
}

/**
 * bar chart: Sum(Si) vs Variance Closure
 * @param {} data  prepared dataset from createVarianceClosureDataset
 */
const VarianceClosureChart = ({ data, h }) => {
    // Extract activity names for the X-axis
    const activities = data.map(d => d.activity);
    // let h = 200
    return (
        <Box height={h} width="90%">
            <BarChart
                dataset={data}
                series={[
                    {
                        dataKey: 'sumSi',
                        label: "Direct (Σ Sᵢ)",
                        stack: 'total', // Crucial for stacking
                        color: '#48BB78', // Green for explained variance
                        valueFormatter: (value) => `${(value * 100).toFixed(1)}%`
                    },
                    {
                        dataKey: 'interaction',
                        label: "Interaction/Unexplained (1 - Σ Sᵢ)",
                        stack: 'total', // Crucial for stacking
                        color: '#F6AD55', // Orange for residual/interaction
                        valueFormatter: (value) => `${(value * 100).toFixed(1)}%`
                    },
                ]}
                xAxis={[
                    {
                        data: activities,
                        scaleType: "band",
                        tickMinStep: 0,
                        tickLabelStyle: {
                            angle: -35,
                            textAnchor: 'end',
                            fontSize: 10,
                        },
                        valueFormatter: (value, context) => {
                            if (context.location === 'tick') {
                                return truncatedData([value])[0];
                            }
                            return value;
                        },
                    },
                ]}
                yAxis={[
                    {
                        label: 'Total Variance',
                        valueFormatter: (value) => `${(value * 100).toFixed(0)}%`,
                        labelStyle: {
                            transform: 'rotate(0deg) translate(0, -60px)',
                            textAlign: 'center',
                            fontSize: '14px',
                            fontWeight: 'normal',
                        },
                        min: 0,
                        max: 1.0, // Ensures the scale goes up to 100%
                    },
                ]}
                margin={{
                    top: 30,
                    bottom: 80,
                    left: 80,
                    right: 10
                }}
                height={h}
                slotProps={{
                    legend: {
                        direction: 'row',
                        position: { vertical: 'top', horizontal: 'right' },
                        padding: 0,
                        labelStyle: {
                            fontSize: 14, // Legend label font size
                        },
                    },

                }}
            />
        </Box>
    );
};
//#endregion Chart Components






//#region REST
const normalizeByMean = (activityValues) => {
    const mean = activityValues.reduce((sum, v) => sum + v, 0) / activityValues.length;
    return activityValues.map(v => v / mean);
};





