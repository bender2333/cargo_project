export type LocalBoxFace = '+X' | '-X' | '+Y' | '-Y' | '+Z' | '-Z'

export function allLabelFaces(): LocalBoxFace[] {
  return ['+X', '-X', '+Y', '+Z', '-Z']
}
