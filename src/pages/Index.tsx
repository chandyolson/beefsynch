import { FolderKanban, Users, Beef, MilkOff } from "lucide-react";
import Navbar from "@/components/Navbar";
import StatCard from "@/components/StatCard";
import ProjectsTable from "@/components/ProjectsTable";
import { mockProjects } from "@/data/mockData";

const Index = () => {
  const totalProjects = mockProjects.length;
  const totalHead = mockProjects.reduce((sum, p) => sum + p.headCount, 0);
  const heiferProjects = mockProjects.filter((p) => p.animalType === "Heifer").length;
  const cowProjects = mockProjects.filter((p) => p.animalType === "Cow").length;

  return (
    <div className="min-h-screen">
      <Navbar />
      <main className="container mx-auto px-4 py-8 space-y-8">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard title="Total Projects" value={totalProjects} icon={FolderKanban} delay={0} />
          <StatCard title="Total Head" value={totalHead} icon={Users} delay={100} />
          <StatCard title="Heifer Projects" value={heiferProjects} icon={Beef} delay={200} />
          <StatCard title="Cow Projects" value={cowProjects} icon={MilkOff} delay={300} />
        </div>
        <ProjectsTable projects={mockProjects} />
      </main>
    </div>
  );
};

export default Index;
