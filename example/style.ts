import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  box: {
    borderWidth: 5,
    flexShrink: 1,
    height: 600,
    width: 480,
  },
  container: {
    alignItems: 'center',
    backgroundColor: 'white',
    flex: 1,
    justifyContent: 'center',
    padding: 20,
  },
  contents: {
    alignSelf: 'stretch',
    flex: 1,
  },
  img: {
    height: '100%',
    resizeMode: 'contain',
    width: '100%',
  },
  marker: {
    backgroundColor: 'white',
    borderRadius: 10,
    borderWidth: 2,
    height: 20,
    left: '50%',
    marginLeft: -10,
    marginTop: -10,
    position: 'absolute',
    top: '50%',
    width: 20,
  },
});
