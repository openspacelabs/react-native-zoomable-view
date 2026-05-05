import { Easing, WithTimingConfig } from 'react-native-reanimated';

export const zoomToAnimation: WithTimingConfig = {
  easing: Easing.out(Easing.ease),
  duration: 250,
};
