export type AnimalType = "Heifer" | "Cow";
export type ProjectStatus = "Tentative" | "Confirmed" | "Complete";

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
  userId?: string | null;
  lastContactedDate?: string | null;
}
