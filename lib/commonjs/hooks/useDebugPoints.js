"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.useDebugPoints = void 0;
var _react = require("react");
var _useLatestCallback = require("./useLatestCallback");
const useDebugPoints = ({
  originalPageX,
  originalPageY
}) => {
  const [debugPoints, setDebugPoints] = (0, _react.useState)([]);

  /**
   * Used to debug pinch events
   * @param gestureResponderEvent
   * @param zoomCenter
   * @param points
   */
  const setPinchDebugPoints = (0, _useLatestCallback.useLatestCallback)((gestureResponderEvent, zoomCenter, ...points) => {
    const {
      touches
    } = gestureResponderEvent.nativeEvent;
    setDebugPoints([{
      x: touches[0].pageX - originalPageX,
      y: touches[0].pageY - originalPageY
    }, {
      x: touches[1].pageX - originalPageX,
      y: touches[1].pageY - originalPageY
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