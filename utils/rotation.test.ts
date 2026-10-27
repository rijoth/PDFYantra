import { describe, expect, it } from 'vitest';
import { effectiveRotation, normalizeRotation } from './rotation';

describe('normalizeRotation', () => {
  it.each([
    [0, 0],
    [90, 90],
    [180, 180],
    [270, 270],
    [360, 0],
    [450, 90],
    [720, 0],
    [-90, 270],
    [-180, 180],
    [-270, 90],
    [-360, 0],
    [-450, 270],
  ])('normalizes %i to %i', (input, expected) => {
    expect(normalizeRotation(input)).toBe(expected);
  });

  it('treats non-finite input as no rotation', () => {
    expect(normalizeRotation(NaN)).toBe(0);
    expect(normalizeRotation(Infinity)).toBe(0);
    expect(normalizeRotation(-Infinity)).toBe(0);
  });
});

describe('effectiveRotation', () => {
  it.each([
    [0, 0, 0],
    [0, 90, 90],
    [90, 90, 180],
    [90, 180, 270],
    [90, 270, 0],
    [270, 90, 0],
    [180, 180, 0],
    [270, 270, 180],
    [90, -90, 0],
    [-90, 90, 0],
    [0, -450, 270],
  ])('combines intrinsic %i and workspace %i into %i', (intrinsic, workspace, expected) => {
    expect(effectiveRotation(intrinsic, workspace)).toBe(expected);
  });

  it('falls back to no rotation for non-finite operands', () => {
    expect(effectiveRotation(NaN, 90)).toBe(90);
    expect(effectiveRotation(90, NaN)).toBe(90);
    expect(effectiveRotation(NaN, NaN)).toBe(0);
  });
});
