import React from 'react';
/**
 * A wrapper component that keeps elements at a fixed visual size regardless of zoom level.
 *
 * @param {{
 *   left: number;
 *   top: number;
 *   children: React.ReactNode;
 * }} param0
 * @param {number} param0.left The left position in percentage (0-100)
 * @param {number} param0.top The top position in percentage (0-100)
 * @param {React.ReactNode} param0.children The children to render inside the fixed size container
 * @returns {*}
 */
export declare const FixedSize: ({ left, top, children, }: {
    left: number;
    top: number;
    children: React.ReactNode;
}) => React.JSX.Element;
export default FixedSize;
//# sourceMappingURL=FixedSize.d.ts.map