import { Text, Select, Flex, Button, Input, Grid, Box, Divider } from "@chakra-ui/react";
import { useState, useEffect } from "react";

// todo get this from up
const distTypeOptions = ["uniform", "triangular", "normal", "deterministic", "lognormal"];

const DriverEditTab = ({ concreteCostDriver, onUpdate, driverEditGridSize }) => {
    const [isEditing, setIsEditing] = useState(false);
    const [editedDriver, setEditedDriver] = useState({ ...concreteCostDriver });
    const [inputValues, setInputValues] = useState({});

    useEffect(() => {
        setEditedDriver({ ...concreteCostDriver });
        setInputValues({}); 
        setIsEditing(false); 
    }, [concreteCostDriver]);

    // console.log("DriverEditTab edClone", concreteCostDriver, editedDriver);

    const handleChange = (field, value) => {
        setEditedDriver(prev => {
            console.log("DriverEditTab handleChange params", value, typeof (value), prev);

            const updatedCost = { ...prev.cost };
            console.log("DriverEditTab handleChange", updatedCost);
            if (field === "distType") {
                // Update distType only, keep cost intact
                return {
                    ...prev,
                    distType: value,
                };
            }

            // Parse input (allow commas for decimals)
            let parsedValue = parseFloat(value.replace(",", "."));

            // Handle percentage inputs
            if (typeof value === "string" && value.endsWith("%")) {
                const percent = parseFloat(value);

                if (field === "stdDev") {
                    const mean = parseFloat(prev.cost.mean || 0);
                    if (!isNaN(percent) && !isNaN(mean)) {
                        parsedValue = (mean * percent) / 100;
                    }
                } else if (field === "max") {
                    const mode = parseFloat(prev.cost.mode || 0);
                    if (!isNaN(percent) && !isNaN(mode)) {
                        parsedValue = mode + (mode * percent) / 100;
                    }
                } else if (field === "min") {
                    const mode = parseFloat(prev.cost.mode || 0);
                    if (!isNaN(percent) && !isNaN(mode)) {
                        parsedValue = mode - (mode * percent) / 100;
                    }
                }
            }
            console.log("onblur: Final parsed value for", field, "is", parsedValue);

            // Apply the updated cost
            updatedCost[field] = parsedValue;
            setInputValues(prev => ({ ...prev, [field]: undefined }));

            return {
                ...prev,
                cost: updatedCost,
            };
        });
    };


    const renderCostInputs = () => {
        const { distType, cost } = editedDriver;

        const labeledInput = (label, field) => (
            <Flex align="center" gap={1}>
                <Text fontSize="sm" width="min-content" whiteSpace="nowrap">{label}: </Text>
                {isEditing ? (
                    <Input
                        value={inputValues[field] ?? (cost[field] ?? "")}
                        onBlur={(e) => handleChange(field, e.target.value)}
                        onChange={(e) => setInputValues(prev => ({ ...prev, [field]: e.target.value }))}
                        size="sm"
                        width="80px"
                    />
                ) : (
                    (() => {
                        const [formatted, exp] = formatNumber(cost[field]);
                        return (
                            <Text width="80px" fontSize="sm">
                                {formatted}
                                {exp !== "0" && exp !== "+0" && (
                                    <Text as="sup" fontWeight="bold">
                                        {parseInt(exp, 10)}
                                    </Text>
                                )}
                            </Text>
                        );
                    })()
                )}
            </Flex>
        );
        // console.log("DriverEditTab renderCostInputs", distType, cost);
        // Render cost parameters based on distType
        switch (distType) {
            case "lognormal":
                return (
                    <Flex gap={2}>
                        {labeledInput("Geo. Mean", "geoMean")}
                        <Divider orientation="vertical" height="60%" alignSelf="center" borderColor="gray.300" />
                        {labeledInput("GSD", "gsd")}
                        
                    </Flex>
                );
            case "deterministic":
                return (
                    <Flex gap={2}>
                        {labeledInput("Cost", "mean")}
                    </Flex>
                );
            case "uniform":
                return (
                    <Flex gap={2}>
                        {labeledInput("Min", "min")}
                         <Divider orientation="vertical" height="60%" alignSelf="center" borderColor="gray.300" />
                        {labeledInput("Max", "max")}
                    </Flex>
                );
            case "triangular":
                return (
                    <Flex gap={2}>
                        {labeledInput("Min", "min")}
                         <Divider orientation="vertical" height="60%" alignSelf="center" borderColor="gray.300" />
                        {labeledInput("Max", "max")}
                         <Divider orientation="vertical" height="60%" alignSelf="center" borderColor="gray.300" />
                        {labeledInput("Mode", "mode")}
                    </Flex>

                );
            case "normal":
                return (
                    <Flex gap={2}>
                        {labeledInput("Mean", "mean")}
                         <Divider orientation="vertical" height="60%" alignSelf="center" borderColor="gray.300" />
                        {labeledInput("StdDev", "stdDev")}

                    </Flex>

                );
            default:
                return null;
        }
    };

    const handleSave = () => {
        onUpdate(editedDriver);
        setIsEditing(false);
    };
    const handleDiscard = () => {
        setEditedDriver({ ...concreteCostDriver });
        setIsEditing(false);
    };

    return (
        <Grid templateColumns={driverEditGridSize} gap={4} mb={2} width={"60%"}>
            <Text as="span" fontWeight="semibold" color="var(--chakra-colors-gray-500)">{concreteCostDriver.name}</Text>

            <Select
                value={editedDriver.distType}
                onChange={(e) => handleChange("distType", e.target.value)}
                size="sm"
                isReadOnly={!isEditing}
                pointerEvents={!isEditing ? "none" : "auto"}
                icon={isEditing ? undefined : <></>}
            >
                {distTypeOptions.map((opt) => (
                    <option key={opt} value={opt}>
                        {opt}
                    </option>
                ))}
            </Select>


            <Flex gap={2}>{renderCostInputs()}</Flex>
            <Flex gap={1}>
                {!isEditing ? (
                    <Button size="sm" onClick={() => setIsEditing(true)}>
                        Edit
                    </Button>
                ) : (
                    <>
                        <Button size="sm" colorScheme="green" onClick={handleSave}>
                            Save
                        </Button>
                        <Button size="sm" onClick={handleDiscard}>
                            Discard
                        </Button>
                    </>
                )}
            </Flex>
        </Grid>
    );
};

/**
 * formats a number into scientific notation with two decimal places
 * except for 0, which is returned as "0"
 * and for exponents of 0, which are not shown
 */
export function formatNumber(number) { /// todo this function is used in multiple places, should be moved to a util file
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

export default DriverEditTab;
