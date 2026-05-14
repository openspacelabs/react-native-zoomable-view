import { render } from '@testing-library/react-native';
import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';

import { NonScalingOverlay } from '../NonScalingOverlay';

type WrapperProps = {
  contentWidth?: number;
  contentHeight?: number;
  wrapperWidth?: number;
  wrapperHeight?: number;
  initialZoom?: number;
  initialOffsetX?: number;
  initialOffsetY?: number;
  withRotation?: boolean;
  children?: React.ReactNode;
};

const Wrapper = (props: WrapperProps) => {
  const zoom = useSharedValue(props.initialZoom ?? 1);
  const offsetX = useSharedValue(props.initialOffsetX ?? 0);
  const offsetY = useSharedValue(props.initialOffsetY ?? 0);
  const rotation = useSharedValue(0);
  return (
    <NonScalingOverlay
      contentWidth={props.contentWidth ?? 400}
      contentHeight={props.contentHeight ?? 600}
      wrapperWidth={props.wrapperWidth ?? 400}
      wrapperHeight={props.wrapperHeight ?? 600}
      zoom={zoom}
      offsetX={offsetX}
      offsetY={offsetY}
      rotation={props.withRotation ? rotation : undefined}
    >
      {props.children}
    </NonScalingOverlay>
  );
};

// Narrow `toJSON()` shape to a node-with-props. The RNTL `toJSON()` may return
// a string, an array, or `null` (zero-dim guard case). Test sites that need
// `props` already guarded against null upstream, so cast here is safe.
type RenderNode = {
  type: string;
  props: Record<string, unknown> & { style?: unknown };
  children: unknown;
};

const rootNode = (tree: ReturnType<ReturnType<typeof render>['toJSON']>) => {
  if (tree === null) throw new Error('expected non-null tree');
  if (Array.isArray(tree)) throw new Error('expected single root');
  if (typeof tree === 'string')
    throw new Error('expected element root, got string');
  return tree as unknown as RenderNode;
};

describe('NonScalingOverlay', () => {
  describe('EC-NSO-1: zero-dim guard', () => {
    it('returns null when contentWidth is 0', () => {
      const { toJSON } = render(<Wrapper contentWidth={0} />);
      expect(toJSON()).toBeNull();
    });

    it('returns null when contentHeight is 0', () => {
      const { toJSON } = render(<Wrapper contentHeight={0} />);
      expect(toJSON()).toBeNull();
    });

    it('mounts when both content dims are non-zero', () => {
      const { toJSON } = render(<Wrapper />);
      expect(toJSON()).not.toBeNull();
    });
  });

  describe('EC-NSO-2: unconditional zeroRotation SharedValue', () => {
    it('rotation prop toggle does not throw "rendered fewer hooks"', () => {
      const { rerender } = render(<Wrapper withRotation={false} />);
      expect(() => {
        rerender(<Wrapper withRotation={true} />);
      }).not.toThrow();
      expect(() => {
        rerender(<Wrapper withRotation={false} />);
      }).not.toThrow();
    });
  });

  describe('EC-NSO-7 / 8 / 9: static styles + pointerEvents', () => {
    it('overlay root has position:absolute, top:0, left:0, overflow:visible, pointerEvents:none', () => {
      const tree = rootNode(render(<Wrapper />).toJSON());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const flat = StyleSheet.flatten(tree.props.style as never) as Record<
        string,
        unknown
      >;
      expect(flat.position).toBe('absolute');
      expect(flat.top).toBe(0);
      expect(flat.left).toBe(0);
      expect(flat.overflow).toBe('visible');
      // pointerEvents is a prop on the View, not a style.
      expect(tree.props.pointerEvents).toBe('none');
    });
  });

  describe('transform plumbing under the reanimated mock', () => {
    it('width/height in the merged style reflect contentWidth × zoom and contentHeight × zoom', () => {
      const tree1 = rootNode(render(<Wrapper initialZoom={1} />).toJSON());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const flat1 = StyleSheet.flatten(tree1.props.style as never) as Record<
        string,
        unknown
      >;
      expect(flat1.width).toBe(400);
      expect(flat1.height).toBe(600);

      const tree2 = rootNode(render(<Wrapper initialZoom={2} />).toJSON());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const flat2 = StyleSheet.flatten(tree2.props.style as never) as Record<
        string,
        unknown
      >;
      expect(flat2.width).toBe(800);
      expect(flat2.height).toBe(1200);
    });

    it('transform is a 5-element array under the reanimated mock', () => {
      const tree = rootNode(render(<Wrapper />).toJSON());
      // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
      const flat = StyleSheet.flatten(tree.props.style as never) as Record<
        string,
        unknown
      >;
      expect(Array.isArray(flat.transform)).toBe(true);
      expect((flat.transform as unknown[]).length).toBe(5);
    });
  });

  describe('children pass-through', () => {
    it('renders children inside the overlay', () => {
      const { getByTestId } = render(
        <Wrapper>
          <View testID="marker" />
        </Wrapper>
      );
      expect(getByTestId('marker')).toBeDefined();
    });

    it('renders Text children', () => {
      const { getByTestId } = render(
        <Wrapper>
          <Text testID="label">hello</Text>
        </Wrapper>
      );
      // `getByTestId` returns ReactTestInstance with `.props: any`. Cast
      // through `unknown` to satisfy strict-type-checked.
      const labelProps = (getByTestId('label') as unknown as RenderNode).props;
      expect(labelProps.children).toBe('hello');
    });
  });
});
