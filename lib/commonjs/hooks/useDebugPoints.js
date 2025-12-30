"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useDebugPoints = void 0;
var _react = require("react");
var _useLatestCallback = require("./useLatestCallback");
const useDebugPoints = () => {
  const [debugPoints, setDebugPoints] = (0, _react.useState)([]);

  /**
   * Used to debug pinch events
   * @param gestureResponderEvent
   * @param zoomCenter
   * @param points
   */
  const setPinchDebugPoints = (0, _useLatestCallback.useLatestCallback)((e, zoomCenter, ...points) => {
    setDebugPoints([{
      x: e.allTouches[0].x,
      y: e.allTouches[0].y
    }, {
      x: e.allTouches[1].x,
      y: e.allTouches[1].y
    }, zoomCenter, ...points]);
  });
  return {
    debugPoints,
    setDebugPoints,
    setPinchDebugPoints
  };
};
exports.useDebugPoints = useDebugPoints;
//# sourceMappingURL=useDebugPoints.js.map