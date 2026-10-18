import { OrbitControls, PerspectiveCamera, Text } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { useMemo, useRef } from "react";
import * as THREE from "three";
import { useRoadTwin } from "../store/useRoadTwin";
import type { RoadNetwork } from "../types";

const roadColor = "#30363c";
const directions = ["north", "east", "south", "west"] as const;
type Approach = (typeof directions)[number];
type Turn = "left" | "straight" | "right";

const vectorFor = (approach: Approach) => {
  if (approach === "north") return new THREE.Vector3(0, 0, 1);
  if (approach === "east") return new THREE.Vector3(1, 0, 0);
  if (approach === "south") return new THREE.Vector3(0, 0, -1);
  return new THREE.Vector3(-1, 0, 0);
};

function VehicleFleet({ network }: { network: RoadNetwork }) {
  const roots = useRef<Array<THREE.Group | null>>([]);
  const previousTime = useRef(0);
  const candidates = useMemo(() => {
    const models: Array<{ curve: THREE.CatmullRomCurve3; stopAt: number; color: string; dimensions: [number, number, number]; length: number; approach: Approach; offset: number; speed: number }> = [];
    const types = [
      { color: "#d8ddd9", dimensions: [0.82, 0.42, 1.5] as [number, number, number] },
      { color: "#d7aa4e", dimensions: [0.78, 0.58, 1.2] as [number, number, number] },
      { color: "#59c4cb", dimensions: [0.36, 0.32, 0.92] as [number, number, number] },
      { color: "#849a82", dimensions: [1.0, 0.78, 2.6] as [number, number, number] },
      { color: "#c27655", dimensions: [0.92, 0.56, 1.7] as [number, number, number] },
    ];
    directions.forEach((approach, approachIndex) => {
      const outward = vectorFor(approach);
      const inbound = outward.clone().negate();
      const laneCount = Math.max(1, network.roads.find((road) => road.id === approach)?.lanes ?? 2);
      for (let index = 0; index < 5; index += 1) {
        const lane = index % laneCount;
        const laneNormal = new THREE.Vector3(-inbound.z, 0, inbound.x);
        const laneOffset = (lane - (laneCount - 1) / 2) * 0.72;
        const lateral = laneNormal.multiplyScalar(laneOffset);
        const vehicleType = types[(index + approachIndex) % types.length];
        const turn: Turn = (["straight", "left", "right", "straight", "left"] as Turn[])[(index + approachIndex) % 5];
        const exitOrder = (approachIndex + (turn === "left" ? 1 : turn === "straight" ? 2 : 3)) % 4;
        const exitOutward = vectorFor(directions[exitOrder]);
        const start = outward.clone().multiplyScalar(24).add(lateral);
        const before = inbound.clone().multiplyScalar(7).add(lateral);
        const after = exitOutward.clone().multiplyScalar(7).add(lateral);
        const end = exitOutward.clone().multiplyScalar(24).add(lateral);
        const curve = new THREE.CatmullRomCurve3([start, before, new THREE.Vector3(0, 0.13, 0), after, end], false, "centripetal");
        const length = curve.getLength();
        models.push({
          curve,
          stopAt: length * 0.43,
          color: vehicleType.color,
          dimensions: vehicleType.dimensions,
          length,
          approach,
          offset: index * 5.2 + approachIndex * 2.7,
          speed: 1.8 + ((index + approachIndex) % 3) * 0.22,
        });
      }
    });
    return models;
  }, [network]);

  useFrame((_, delta) => {
    const time = useRoadTwin.getState().simulationTime;
    const isPlaying = useRoadTwin.getState().playing;
    const playbackSpeed = useRoadTwin.getState().speed;
    const phase = signalPhase(network, time);
    let simulationDelta = isPlaying ? delta * playbackSpeed : Math.max(0, time - previousTime.current);
    if (time < previousTime.current) {
      simulationDelta = 0;
      candidates.forEach((vehicle, index) => {
        const root = roots.current[index];
        if (root) root.userData.distance = vehicle.offset % (vehicle.stopAt - 1);
      });
    }
    previousTime.current = time;
    const distances = roots.current.map((root) => root?.userData.distance as number | undefined);
    candidates.forEach((vehicle, index) => {
      const root = roots.current[index];
      if (!root) return;
      const current = root.userData.distance as number;
      let distance = current;
      if (simulationDelta > 0) {
        const nextDistance = Math.min(vehicle.length - 0.8, current + simulationDelta * vehicle.speed);
        const isAtStop = current < vehicle.stopAt && nextDistance >= vehicle.stopAt;
        if (isAtStop && (phase.state !== "green" || phase.approach !== vehicle.approach)) {
          distance = vehicle.stopAt - 0.05;
        } else if (current >= vehicle.stopAt && (phase.state !== "green" || phase.approach !== vehicle.approach)) {
          distance = current;
        } else if (current >= vehicle.length - 0.8) {
          distance = 0;
        } else {
          distance = nextDistance;
        }
        const leaderDistance = candidates.reduce<number | null>((nearest, other, otherIndex) => {
          if (other.approach !== vehicle.approach || otherIndex === index) return nearest;
          const otherDistance = distances[otherIndex];
          if (otherDistance === undefined || otherDistance <= current) return nearest;
          return nearest === null || otherDistance < nearest ? otherDistance : nearest;
        }, null);
        if (leaderDistance !== null) distance = Math.min(distance, Math.max(0, leaderDistance - 2.4));
        root.userData.distance = distance;
      }
      const point = vehicle.curve.getPointAt(distance / vehicle.length);
      const tangent = vehicle.curve.getTangentAt(distance / vehicle.length);
      root.position.set(point.x, point.y, point.z);
      root.rotation.y = Math.atan2(tangent.x, tangent.z);
    });
  });

  return (
    <group>
      {candidates.map((vehicle, index) => (
        <group
          key={`${vehicle.approach}-${index}`}
          ref={(node) => {
            roots.current[index] = node;
            if (node && node.userData.distance === undefined) {
              node.userData.distance = vehicle.offset % (vehicle.stopAt - 1);
            }
          }}
        >
          <mesh castShadow position={[0, 0.35, 0]}>
            <boxGeometry args={vehicle.dimensions} />
            <meshStandardMaterial color={vehicle.color} roughness={0.65} />
          </mesh>
          <mesh position={[0, 0.61, -0.06]}>
            <boxGeometry args={[vehicle.dimensions[0] * 0.72, vehicle.dimensions[1] * 0.65, vehicle.dimensions[2] * 0.48]} />
            <meshStandardMaterial color="#202b31" roughness={0.3} />
          </mesh>
        </group>
      ))}
    </group>
  );
}

function signalPhase(network: RoadNetwork, time: number): { approach: string | null; state: "green" | "amber" | "red" } {
  const entries = Object.entries(network.signal.green_s);
  const amber = entries.length * network.signal.amber_s;
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const effective = Math.max(1, network.signal.cycle_s - amber);
  let position = time % (effective + amber);
  for (const [approach, raw] of entries) {
    const phase = raw * effective / total;
    if (position < phase) return { approach, state: "green" };
    position -= phase;
    if (position < network.signal.amber_s) return { approach, state: "amber" };
    position -= network.signal.amber_s;
  }
  return { approach: null, state: "red" };
}

function RoadSurface({ approach, selected, onSelect }: { approach: Approach; selected: boolean; onSelect: () => void }) {
  const vertical = approach === "north" || approach === "south";
  const position: [number, number, number] =
    approach === "north" ? [0, 0.07, 14.5] :
      approach === "south" ? [0, 0.07, -14.5] :
        approach === "east" ? [14.5, 0.07, 0] : [-14.5, 0.07, 0];
  return (
    <mesh
      receiveShadow
      rotation={[-Math.PI / 2, 0, 0]}
      position={position}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
    >
      <planeGeometry args={vertical ? [10, 19] : [19, 10]} />
      <meshStandardMaterial color={selected ? "#334a50" : roadColor} roughness={0.98} />
    </mesh>
  );
}

function RoadWorld({ network, visibility }: { network: RoadNetwork; visibility: { vehicles: boolean; pedestrians: boolean; signals: boolean; buildings: boolean } }) {
  const selectedRoad = useRoadTwin((state) => state.selectedRoad);
  const selectRoad = useRoadTwin((state) => state.selectRoad);
  const view = useRoadTwin((state) => state.view);
  const playing = useRoadTwin((state) => state.playing);
  const simulationTime = useRoadTwin((state) => state.simulationTime);
  const pedestrians = useMemo(() => Array.from({ length: 12 }, (_, i) => ({
    x: -4.2 + (i % 6) * 1.65,
    z: i < 6 ? 7.2 + (i % 3) * 0.3 : -7.1 - (i % 3) * 0.3,
    direction: i % 2 === 0 ? 1 : -1,
  })), []);
  const tickAccumulator = useRef(0);

  useFrame((_, delta) => {
    if (!playing) return;
    tickAccumulator.current += delta;
    if (tickAccumulator.current >= 0.1) {
      const ticks = Math.floor(tickAccumulator.current / 0.1);
      tickAccumulator.current -= ticks * 0.1;
      useRoadTwin.getState().advance(ticks * 0.1);
    }
  });

  const camera = view === "top" ? [0, 36, 0.1] as [number, number, number]
    : view === "street" ? [12, 5, 14] as [number, number, number]
      : [27, 31, 30] as [number, number, number];

  return (
    <>
      <color attach="background" args={["#101519"]} />
      <fog attach="fog" args={["#101519", 38, 76]} />
      <PerspectiveCamera makeDefault position={camera} fov={45} />
      <OrbitControls enableDamping dampingFactor={0.08} maxPolarAngle={Math.PI / 2.05} minDistance={12} maxDistance={55} target={[0, 0, 0]} />
      <ambientLight intensity={1.25} />
      <directionalLight position={[12, 24, 8]} intensity={2.2} castShadow shadow-mapSize={[1024, 1024]} />
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.08, 0]} receiveShadow>
        <planeGeometry args={[100, 100]} />
        <meshStandardMaterial color="#18201e" />
      </mesh>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.07, 0]} receiveShadow>
        <planeGeometry args={[10, 10]} />
        <meshStandardMaterial color="#30363c" roughness={0.98} />
      </mesh>

      <RoadSurface approach="north" selected={selectedRoad === "north"} onSelect={() => selectRoad("north")} />
      <RoadSurface approach="south" selected={selectedRoad === "south"} onSelect={() => selectRoad("south")} />
      <RoadSurface approach="east" selected={selectedRoad === "east"} onSelect={() => selectRoad("east")} />
      <RoadSurface approach="west" selected={selectedRoad === "west"} onSelect={() => selectRoad("west")} />

      {directions.map((approach, index) => (
        <group key={approach}>
          <mesh position={[0, 0.16, index % 2 === 0 ? 12.1 * (index === 0 ? 1 : -1) : 0]}>
            <boxGeometry args={[12.7, 0.18, 2.1]} />
            <meshStandardMaterial color="#62645e" />
          </mesh>
          {Array.from({ length: 5 }, (_, stripe) => (
            <mesh key={`${approach}-cross-${stripe}`} rotation={[-Math.PI / 2, 0, 0]} position={
              approach === "north" ? [-4 + stripe * 2, 0.17, 7.3] :
                approach === "south" ? [-4 + stripe * 2, 0.17, -7.3] :
                  approach === "east" ? [7.3, 0.17, -4 + stripe * 2] : [-7.3, 0.17, -4 + stripe * 2]
            }>
              <planeGeometry args={approach === "north" || approach === "south" ? [0.82, 2.1] : [2.1, 0.82]} />
              <meshBasicMaterial color="#d9d7c9" />
            </mesh>
          ))}
        </group>
      ))}

      {Array.from({ length: 14 }, (_, index) => (
        <mesh key={`lane-${index}`} rotation={[-Math.PI / 2, 0, 0]} position={[-19 + index * 3, 0.14, index % 2 === 0 ? 1.2 : -1.2]}>
          <planeGeometry args={[1.35, 0.12]} />
          <meshBasicMaterial color="#94958e" transparent opacity={0.8} />
        </mesh>
      ))}
      {Array.from({ length: 10 }, (_, index) => (
        <mesh key={`lane-v-${index}`} rotation={[-Math.PI / 2, 0, Math.PI / 2]} position={[index % 2 === 0 ? 1.2 : -1.2, 0.14, -14 + index * 3]}>
          <planeGeometry args={[1.35, 0.12]} />
          <meshBasicMaterial color="#94958e" transparent opacity={0.8} />
        </mesh>
      ))}

      {visibility.signals && directions.map((approach) => {
        const outward = vectorFor(approach);
        const x = outward.x * 7.2;
        const z = outward.z * 7.2;
        const phase = signalPhase(network, simulationTime);
        const approachPhase = phase.approach === approach ? phase.state : "red";
        return (
          <group key={`signal-${approach}`} position={[x, 0, z]}>
            <mesh position={[0, 1.5, 0]} castShadow>
              <cylinderGeometry args={[0.08, 0.11, 3, 8]} />
              <meshStandardMaterial color="#676c68" />
            </mesh>
            <mesh position={[0, 2.85, 0]}>
              <boxGeometry args={[0.42, 1.05, 0.34]} />
              <meshStandardMaterial color="#191d1f" />
            </mesh>
            {["#d85a50", "#d9a744", "#68ba79"].map((color, lightIndex) => (
              <mesh key={color} position={[0, 3.17 - lightIndex * 0.31, 0.19]}>
                <sphereGeometry args={[0.105, 12, 12]} />
                <meshStandardMaterial color={approachPhase === ["red", "amber", "green"][lightIndex] ? color : "#33383a"} emissive={approachPhase === ["red", "amber", "green"][lightIndex] ? color : "#000000"} emissiveIntensity={approachPhase === ["red", "amber", "green"][lightIndex] ? 0.55 : 0} />
              </mesh>
            ))}
          </group>
        );
      })}

      {directions.map((approach, index) => (
        <group key={`sidewalk-${approach}`}>
          <mesh rotation={[-Math.PI / 2, 0, index % 2 === 0 ? 0 : Math.PI / 2]} position={[0, 0.04, index === 0 ? 13.6 : index === 2 ? -13.6 : 0]}>
            <planeGeometry args={[31, 2.2]} />
            <meshStandardMaterial color="#4c514e" />
          </mesh>
          <mesh position={[index === 1 ? 13.6 : index === 3 ? -13.6 : 0, 0.16, 0]}>
            <boxGeometry args={[2.2, 0.18, 31]} />
            <meshStandardMaterial color="#4c514e" />
          </mesh>
        </group>
      ))}

      {visibility.buildings && Array.from({ length: 8 }, (_, i) => {
        const x = i % 2 === 0 ? -15 : 15;
        const z = Math.floor(i / 2) % 2 === 0 ? -15 : 15;
        const height = 4 + (i * 7 % 8);
        return (
          <group key={`building-${i}`} position={[x, height / 2, z]}>
            <mesh castShadow receiveShadow>
              <boxGeometry args={[7 + (i % 3), height, 7]} />
              <meshStandardMaterial color={i % 3 === 0 ? "#4a5452" : "#38444a"} roughness={0.85} />
            </mesh>
            {Array.from({ length: Math.floor(height / 1.8) }, (_, floor) => (
              <mesh key={`window-${floor}`} position={[0, -height / 2 + 1 + floor * 1.8, 3.54]}>
                <boxGeometry args={[4.5, 0.42, 0.05]} />
                <meshStandardMaterial color="#bca978" emissive="#725f39" emissiveIntensity={0.17} />
              </mesh>
            ))}
          </group>
        );
      })}

      {Array.from({ length: 7 }, (_, i) => {
        const x = i < 4 ? -18 + i * 2.6 : 16;
        const z = i < 4 ? -17 : -14 + (i - 4) * 5;
        return (
          <group key={`tree-${i}`} position={[x, 0, z]}>
            <mesh position={[0, 1, 0]}><cylinderGeometry args={[0.16, 0.24, 2, 7]} /><meshStandardMaterial color="#705640" /></mesh>
            <mesh position={[0, 2.3, 0]}><icosahedronGeometry args={[1.2, 1]} /><meshStandardMaterial color="#526b58" roughness={1} /></mesh>
          </group>
        );
      })}

      <group position={[10, 0.16, 15]}>
        <mesh><boxGeometry args={[4.5, 0.22, 1.8]} /><meshStandardMaterial color="#bd8d3e" /></mesh>
        <Text position={[0, 0.42, 0]} fontSize={0.42} color="#f0d18b">BUS STOP</Text>
      </group>
      {network.obstructions.east > 0 && (
        <group position={[14, 0.16, 0]}>
          <mesh><boxGeometry args={[0.5, 0.55, 2.1]} /><meshStandardMaterial color="#d4a84e" /></mesh>
          <mesh position={[0, 0.35, 0]}><boxGeometry args={[0.42, 0.12, 1.8]} /><meshStandardMaterial color="#303639" /></mesh>
        </group>
      )}
      <Text position={[0, 0.18, 0]} rotation={[-Math.PI / 2, 0, 0]} fontSize={0.68} color="#79817f" anchorX="center">SCHOOL GATE JUNCTION</Text>
      {visibility.pedestrians && pedestrians.map((pedestrian, index) => (
        <mesh key={`ped-${index}`} position={[pedestrian.x, 0.55, pedestrian.z + (playing ? Math.sin(simulationTime * 1.2 + index) * 0.18 : 0)]}>
          <capsuleGeometry args={[0.18, 0.55, 4, 7]} />
          <meshStandardMaterial color={index % 2 === 0 ? "#cbb77a" : "#86a9a5"} />
        </mesh>
      ))}
      {visibility.vehicles && <VehicleFleet network={network} />}
    </>
  );
}

export function TrafficScene({ network, visibility }: { network: RoadNetwork; visibility: { vehicles: boolean; pedestrians: boolean; signals: boolean; buildings: boolean } }) {
  return (
    <Canvas shadows dpr={[1, 1.6]}>
      <RoadWorld network={network} visibility={visibility} />
    </Canvas>
  );
}
