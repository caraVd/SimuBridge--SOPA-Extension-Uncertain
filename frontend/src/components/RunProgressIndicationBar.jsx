import { Card, Box, Progress } from "@chakra-ui/react";

export default function RunProgressIndicationBar({ started, finished, errored }) {
// console.log("RunProgressIndicationBar", started, finished, errored);
  let progress = 0;
  let color = "green";
    let animate = false;

  if (started && !finished) {
    animate = true;
    if(typeof started === "number")
        progress = started;
    else
        progress = 15;
    color = "green";
  }
  if (finished) {
    animate = false;
    progress = 100;
    color = errored ? "red" : (window.canceled ? "gray" : "green");
  }
  //  console.log("RunProgressIndicationBar", progress, color, animate, started);

 
  return (
    <Card bg="white" p="5">
      <Box position="relative" height="20px">
        {/* Gray background */}
        <Box className="progress-bg" />
        {/* Filled part with stripes */}
        <Box
          className={`progress-fill progress-fill-${color} ${animate ? "progress-animate" : ""}`}
          style={{ width: `${progress}%` }}
        />
      </Box>


       <style>
        {`
          .progress-container {
            height: 20px;
          }
          .progress-bg {
            width: 100%;
            height: 20px;
            background-color: var(--chakra-colors-gray-200);
            border-radius: var(--chakra-radii-md);
          }
          .progress-fill {
            position: absolute;
            top: 0;
            left: 0;
            height: 20px;
            border-radius: var(--chakra-radii-md);
            
            background-image: repeating-linear-gradient(
              45deg,
              currentColor,
              currentColor 10px,
              rgba(0, 0, 0, 0.1) 10px,
              rgba(0, 0, 0, 0.1) 20px
            );
          }
        .progress-animate {
            animation: stripeMove 2s linear infinite;
          }
          .progress-fill-green {
            color: var(--chakra-colors-green-400);
          }
          .progress-fill-red {
            color: var(--chakra-colors-red-400);
          }
          .progress-fill-gray {
            color: var(--chakra-colors-gray-400);
          }
          @keyframes stripeMove {
            from { background-position: 0 0; }
            to { background-position: 50px 0; }
          }
        `}
      </style>
    </Card>
  );
}