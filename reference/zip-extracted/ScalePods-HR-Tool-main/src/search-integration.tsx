import { StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { SuggestiveSearch } from "./components/ui/suggestive-search";

const suggestionsMap: Record<string, string[]> = {
  dashboard: ["Search candidates...", "Search campaigns...", "Search interviews..."],
  campaigns: [
    "Quant Analyst", "Business Analyst", "Business Development",
    "AI Automation Engineer", "Software Engineer", "Project Manager",
    "HR Executive", "Data Analyst", "Marketing Executive",
    "Sales Manager", "Accountant", "Graphic Designer",
    "UI/UX Designer", "Operations Executive", "Team Lead",
    "Customer Support Executive", "Office Administrator", "Product Manager"
  ],
  create: [
    "Quant Analyst", "Business Analyst", "Business Development",
    "AI Automation Engineer", "Software Engineer", "Project Manager",
    "HR Executive", "Data Analyst", "Marketing Executive",
    "Sales Manager", "Accountant", "Graphic Designer",
    "UI/UX Designer", "Operations Executive", "Team Lead",
    "Customer Support Executive", "Office Administrator", "Product Manager"
  ],
  meetings: ["Search interviews...", "Search by date...", "Search by interviewer..."],
  "campaign-detail": [
    "Mithul CE", "Yash Rao", "Viraj Gosawami", "Abeer Gandhi",
    "Mohammad Fazal Attar", "Deep Bartaria", "Tushar Funde"
  ],
};

let root: Root | null = null;
const rootEl = document.getElementById("search-root");

function mountSearch(page: string) {
  const suggestions = suggestionsMap[page] || suggestionsMap.dashboard;
  if (rootEl) {
    if (root) root.unmount();
    root = createRoot(rootEl);
    root.render(
      <StrictMode>
        <SuggestiveSearch
          suggestions={suggestions}
          effect="typewriter"
          showTrailing={false}
          className="w-56"
        />
      </StrictMode>
    );
  }
}

window.__mountSearch = mountSearch;

mountSearch("dashboard");
