import { Box, Text, Select, Flex } from "@chakra-ui/react";
import React from "react";



const FormattedConcreteDriver = ({ concreteCostDriver, cType, onUpdate }) => {
  let cost = concreteCostDriver.cost;

  let exponent, formattedNumber;
  let mcFormatted = {};

  if (cType === "lazy") {
    const [formattedNumber, exponent] = formatNumber(cost);
    return (
      <Box>
        <Text>
          <Text as="span">{concreteCostDriver.name}: </Text>
          {renderValue("", [formattedNumber, exponent])}
        </Text>
      </Box>
    );
  }

  const stats = {
    mean: formatNumber(cost.mean),
    median: formatNumber(cost.median),
    stdDev: formatNumber(cost.stdDev),
    mode: formatNumber(cost.mode),
    gsd: formatNumber(cost.gsd),
    geoMean: formatNumber(cost.geoMean),
  };


  return (
    <Box>
      <Text as="span" fontWeight="semibold" color="var(--chakra-colors-gray-500)">
  {concreteCostDriver.name}:
</Text>&nbsp;
      {Object.entries(stats).map(([label, val], i) => (
        <React.Fragment key={label}>
          {i > 0 && <Text as="span">&nbsp;&nbsp;&nbsp;</Text>}
          {renderValue(label, val)}
        </React.Fragment>
      ))}
    </Box>
  );
};




// todo impotr from utils
/**
 * formats a number into scientific notation with two decimal places
 * except for 0, which is returned as "0"
 * and for exponents of 0, which are not shown
 * @param {number} number 
 * @returns formattedNumber 
 * @returns exponent
 */
function formatNumber(number) {
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

/**
 * helper function to render value + exponent
 * @param {*} label 
 * @param {*} param1 
 * @returns 
 */
const renderValue = (label, [num, exp]) => (
  <>
    <Text as="span">{label}: {num}</Text>
    {exp !== "0" && exp !== "+0" && exp !== "-0" && (
      <Text as="sup" fontWeight="bold">{parseInt(exp, 10)}</Text>
    )}
  </>
);

export default FormattedConcreteDriver;