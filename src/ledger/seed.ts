import type { Dispatch, Station } from "./types";

// 时段表（按时间排序，用于最早可用时段计算）
export const SLOTS = [
  "06:00-08:00",
  "08:00-10:00",
  "10:00-12:00",
  "12:00-14:00",
  "14:00-16:00",
  "16:00-18:00",
  "18:00-20:00",
  "20:00-22:00",
] as const;

export type Slot = (typeof SLOTS)[number];

// 油站种子数据
export const SEED_STATIONS: Station[] = [
  {
    id: "st-east",
    name: "东区一站",
    area: "东区",
    lat: 39.91,
    lng: 116.42,
    safetyStock: 8000,
    parkingSpots: 4,
    guaranteedFuel: 5000,
    stock: 36000,
  },
  {
    id: "st-airport",
    name: "机场快线站",
    area: "机场线",
    lat: 40.06,
    lng: 116.58,
    safetyStock: 5000,
    parkingSpots: 3,
    guaranteedFuel: 3000,
    stock: 9000,
  },
  {
    id: "st-west",
    name: "西区枢纽",
    area: "西区",
    lat: 39.84,
    lng: 116.24,
    safetyStock: 10000,
    parkingSpots: 6,
    guaranteedFuel: 6000,
    stock: 25000,
  },
  {
    id: "st-south",
    name: "南区补能站",
    area: "南区",
    lat: 39.74,
    lng: 116.4,
    safetyStock: 6000,
    parkingSpots: 3,
    guaranteedFuel: 4000,
    stock: 12000,
  },
];

// 车次种子数据（已确认派单）
export const SEED_DISPATCHES: Dispatch[] = [
  {
    id: "d-001",
    trainNumber: "G001",
    stationId: "st-east",
    slot: "08:00-10:00",
    fuelAmount: 8000,
    status: "confirmed",
  },
  {
    id: "d-002",
    trainNumber: "G002",
    stationId: "st-east",
    slot: "08:00-10:00",
    fuelAmount: 6000,
    status: "confirmed",
  },
  {
    id: "d-003",
    trainNumber: "G003",
    stationId: "st-east",
    slot: "08:00-10:00",
    fuelAmount: 7000,
    status: "confirmed",
  },
  {
    // 机场快线站 10:00-12:00 已停满 3 个车位（parkingSpots=3），用于演示容量不足
    id: "d-004",
    trainNumber: "G004",
    stationId: "st-airport",
    slot: "10:00-12:00",
    fuelAmount: 5000,
    status: "confirmed",
  },
  {
    id: "d-005",
    trainNumber: "G005",
    stationId: "st-airport",
    slot: "10:00-12:00",
    fuelAmount: 4500,
    status: "confirmed",
  },
  {
    id: "d-006",
    trainNumber: "G006",
    stationId: "st-airport",
    slot: "10:00-12:00",
    fuelAmount: 5500,
    status: "confirmed",
  },
  {
    id: "d-007",
    trainNumber: "G007",
    stationId: "st-west",
    slot: "09:00-11:00",
    fuelAmount: 9000,
    status: "confirmed",
  },
  {
    id: "d-008",
    trainNumber: "G008",
    stationId: "st-west",
    slot: "09:00-11:00",
    fuelAmount: 8500,
    status: "confirmed",
  },
  {
    id: "d-009",
    trainNumber: "G009",
    stationId: "st-south",
    slot: "14:00-16:00",
    fuelAmount: 6000,
    status: "confirmed",
  },
];
