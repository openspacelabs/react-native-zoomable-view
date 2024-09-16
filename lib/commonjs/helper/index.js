"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.calcGestureCenterPoint = calcGestureCenterPoint;
exports.calcGestureTouchDistance = calcGestureTouchDistance;
Object.defineProperty(exports, "calcNewScaledOffsetForZoomCentering", {
  enumerable: true,
  get: function () {
    return _calcNewScaledOffsetForZoomCentering.calcNewScaledOffsetForZoomCentering;
  }
});

var _calcNewScaledOffsetForZoomCentering = require("./calcNewScaledOffsetForZoomCentering");

/**
 * Calculates the gesture center point relative to the page coordinate system
 *
 * We're unable to use touch.locationX/Y
 * because locationX uses the axis system of the leaf element that the touch occurs on,
 * which makes it even more complicated to translate into our container's axis system.
 *
 * We're also unable to use gestureState.moveX/Y
 * because gestureState.moveX/Y is messed up on real device
 * (Sometimes it's the center point, but sometimes it randomly takes the position of one of the touches)
 */
function calcGestureCenterPoint(e, gestureState) {
  var _e$nativeEvent;

  const touches = e === null || e === void 0 ? void 0 : (_e$nativeEvent = e.nativeEvent) === null || _e$nativeEvent === void 0 ? void 0 : _e$nativeEvent.touches;
  if (!touches[0]) return null;

  if (gestureState.numberActiveTouches === 2) {
    if (!touches[1]) return null;
    return {
      x: (touches[0].pageX + touches[1].pageX) / 2,
      y: (touches[0].pageY + touches[1].pageY) / 2
    };
  }

  if (gestureState.numberActiveTouches === 1) {
    return {
      x: touches[0].pageX,
      y: touches[0].pageY
    };
  }

  return null;
}

function calcGestureTouchDistance(e, gestureState) {
  var _e$nativeEvent2;

  const touches = e === null || e === void 0 ? void 0 : (_e$nativeEvent2 = e.nativeEvent) === null || _e$nativeEvent2 === void 0 ? void 0 : _e$nativeEvent2.touches;
  if (gestureState.numberActiveTouches !== 2 || !touches[0] || !touches[1]) return null;
  const dx = Math.abs(touches[0].pageX - touches[1].pageX);
  const dy = Math.abs(touches[0].pageY - touches[1].pageY);
  return Math.sqrt(dx * dx + dy * dy);
}
//# sourceMappingURL=index.js.map