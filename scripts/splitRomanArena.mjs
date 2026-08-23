import fs from 'node:fs';

const inputPath = 'art/blender/roman_arena_source.glb';
const input = fs.readFileSync(inputPath);

const jsonLength = input.readUInt32LE(12);
const jsonOffset = 20;
const json = JSON.parse(input.subarray(jsonOffset, jsonOffset + jsonLength).toString('utf8').trim());
const paddedJsonLength = (jsonLength + 3) & ~3;
const binHeaderOffset = jsonOffset + paddedJsonLength;
const binLength = input.readUInt32LE(binHeaderOffset);
const binOffset = binHeaderOffset + 8;
const bin = input.subarray(binOffset, binOffset + binLength);

if (!json.meshes?.length || !json.nodes?.length || json.meshes[0].primitives.length !== 9) {
  throw new Error('Unexpected Roman arena GLB layout; refusing to split it.');
}

const sourceNode = json.nodes.find((node) => node.mesh === 0);
if (!sourceNode) throw new Error('Could not find the Roman arena mesh node.');

const primitiveGroups = {
  core: [0, 1, 2, 3],
  decor: [4, 8],
};

function align4(value) {
  return (value + 3) & ~3;
}

function makeChunk(name, primitiveIndexes) {
  const sourceMesh = json.meshes[0];
  const sourcePrimitives = sourceMesh.primitives;
  const bufferViews = [];
  const accessors = [];
  const meshes = [];
  const nodes = [];
  const materials = [];
  const materialMap = new Map();
  const chunks = [];
  let byteLength = 0;

  const copyAccessor = (accessorIndex) => {
    const sourceAccessor = json.accessors[accessorIndex];
    const sourceView = json.bufferViews[sourceAccessor.bufferView];
    const sourceStart = sourceView.byteOffset ?? 0;
    const sourceEnd = sourceStart + sourceView.byteLength;
    const targetOffset = align4(byteLength);
    if (targetOffset > byteLength) chunks.push(Buffer.alloc(targetOffset - byteLength));
    chunks.push(bin.subarray(sourceStart, sourceEnd));
    byteLength = targetOffset + sourceView.byteLength;

    const targetViewIndex = bufferViews.length;
    bufferViews.push({
      ...sourceView,
      buffer: 0,
      byteOffset: targetOffset,
    });

    const targetAccessorIndex = accessors.length;
    accessors.push({
      ...sourceAccessor,
      bufferView: targetViewIndex,
    });
    return targetAccessorIndex;
  };

  for (const primitiveIndex of primitiveIndexes) {
    const sourcePrimitive = sourcePrimitives[primitiveIndex];
    const attributes = {};
    for (const [attributeName, accessorIndex] of Object.entries(sourcePrimitive.attributes)) {
      attributes[attributeName] = copyAccessor(accessorIndex);
    }

    const primitive = {
      ...sourcePrimitive,
      attributes,
    };
    if (sourcePrimitive.indices !== undefined) primitive.indices = copyAccessor(sourcePrimitive.indices);

    const sourceMaterialIndex = sourcePrimitive.material;
    if (sourceMaterialIndex !== undefined) {
      let targetMaterialIndex = materialMap.get(sourceMaterialIndex);
      if (targetMaterialIndex === undefined) {
        targetMaterialIndex = materials.length;
        materialMap.set(sourceMaterialIndex, targetMaterialIndex);
        materials.push({ ...json.materials[sourceMaterialIndex] });
      }
      primitive.material = targetMaterialIndex;
    }

    const materialName = json.materials[sourceMaterialIndex]?.name ?? `primitive-${primitiveIndex}`;
    const meshIndex = meshes.length;
    meshes.push({
      name: `${name}-${materialName}`,
      primitives: [primitive],
    });
    nodes.push({
      name: `${name}-${materialName}`,
      mesh: meshIndex,
      translation: sourceNode.translation,
      rotation: sourceNode.rotation,
      scale: sourceNode.scale,
    });
  }

  const outputBin = Buffer.concat(chunks, byteLength);
  const outputJson = {
    asset: { ...json.asset },
    scene: 0,
    scenes: [{ name, nodes: nodes.map((_, index) => index) }],
    nodes,
    meshes,
    materials,
    accessors,
    bufferViews,
    buffers: [{ byteLength: outputBin.length }],
  };

  const jsonBuffer = Buffer.from(JSON.stringify(outputJson));
  const paddedOutputJson = Buffer.concat([
    jsonBuffer,
    Buffer.alloc(align4(jsonBuffer.length) - jsonBuffer.length, 0x20),
  ]);
  const paddedOutputBin = Buffer.concat([
    outputBin,
    Buffer.alloc(align4(outputBin.length) - outputBin.length),
  ]);
  const totalLength = 12 + 8 + paddedOutputJson.length + 8 + paddedOutputBin.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(totalLength, 8);
  const jsonHeader = Buffer.alloc(8);
  jsonHeader.writeUInt32LE(paddedOutputJson.length, 0);
  jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(paddedOutputBin.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, paddedOutputJson, binHeader, paddedOutputBin]);
}

for (const [name, primitiveIndexes] of Object.entries(primitiveGroups)) {
  const outputPath = `public/models/roman_arena_${name}.glb`;
  fs.writeFileSync(outputPath, makeChunk(name, primitiveIndexes));
  console.log(`${outputPath}: ${fs.statSync(outputPath).size} bytes`);
}
