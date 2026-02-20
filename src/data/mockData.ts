export type AnimalType = "Heifer" | "Cow";
export type ProjectStatus = "Active" | "Completed" | "Scheduled";

export interface BreedingProject {
  id: string;
  name: string;
  animalType: AnimalType;
  protocol: string;
  headCount: number;
  startDate: string;
  breedDate: string;
  status: ProjectStatus;
  location: string;
}

export const protocols = [
  "14-Day CIDR",
  "7-Day CO-Synch + CIDR",
  "5-Day CO-Synch + CIDR",
  "MGA-PG",
  "Select Synch + CIDR",
  "PG 6-Day CIDR",
];

export const mockProjects: BreedingProject[] = [
  {
    id: "1",
    name: "Spring Heifer Group A",
    animalType: "Heifer",
    protocol: "14-Day CIDR",
    headCount: 85,
    startDate: "2026-03-01",
    breedDate: "2026-03-15",
    status: "Scheduled",
    location: "North Pasture",
  },
  {
    id: "2",
    name: "Mature Cow Herd 1",
    animalType: "Cow",
    protocol: "7-Day CO-Synch + CIDR",
    headCount: 150,
    startDate: "2026-02-10",
    breedDate: "2026-02-20",
    status: "Active",
    location: "Main Barn",
  },
  {
    id: "3",
    name: "Fall Heifer Replacements",
    animalType: "Heifer",
    protocol: "5-Day CO-Synch + CIDR",
    headCount: 60,
    startDate: "2026-01-05",
    breedDate: "2026-01-12",
    status: "Completed",
    location: "South Lot",
  },
  {
    id: "4",
    name: "Cow Herd - East Ranch",
    animalType: "Cow",
    protocol: "MGA-PG",
    headCount: 200,
    startDate: "2026-03-10",
    breedDate: "2026-04-01",
    status: "Scheduled",
    location: "East Ranch",
  },
  {
    id: "5",
    name: "Spring Heifer Group B",
    animalType: "Heifer",
    protocol: "Select Synch + CIDR",
    headCount: 45,
    startDate: "2026-02-15",
    breedDate: "2026-02-25",
    status: "Active",
    location: "Feedlot 2",
  },
  {
    id: "6",
    name: "Mature Cow Herd 2",
    animalType: "Cow",
    protocol: "PG 6-Day CIDR",
    headCount: 120,
    startDate: "2026-01-20",
    breedDate: "2026-02-01",
    status: "Completed",
    location: "West Pasture",
  },
];
