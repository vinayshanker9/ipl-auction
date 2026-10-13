export const AUCTION_CONFIG = {
  startingPurse: 12000, // lakh; display as crore by dividing by 100
  minSquad: 18,
  maxSquad: 25,
  maxOverseas: 8,
  basePrice: 20,
  bidSlabs: [{ below: 200, increment: 5 }, { below: 500, increment: 10 }, { below: 1000, increment: 20 }, { below: Infinity, increment: 25 }],
  playerTimerMs: 10_000,
  minPlayerTimerMs: 5_000,
  maxPlayerTimerMs: 60_000,
  rtmEnabled: false,
} as const;

export const AVAILABLE_SEASON_YEARS = Array.from({ length: 19 }, (_, index) => 2008 + index);

export const FRANCHISES = [
  { id: "mumbai", name: "Mumbai Indians", monogram: "MI", color: "#004B8D" },
  { id: "chennai", name: "Chennai Super Kings", monogram: "CSK", color: "#F9CD05" },
  { id: "bengaluru", name: "Royal Challengers Bengaluru", monogram: "RCB", color: "#D71920" },
  { id: "kolkata", name: "Kolkata Knight Riders", monogram: "KKR", color: "#3A225D" },
  { id: "delhi", name: "Delhi Capitals", monogram: "DC", color: "#17479E" },
  { id: "punjab", name: "Punjab Kings", monogram: "PBKS", color: "#ED1B24" },
  { id: "jaipur", name: "Rajasthan Royals", monogram: "RR", color: "#EA1A85" },
  { id: "hyderabad", name: "Sunrisers Hyderabad", monogram: "SRH", color: "#F26522" },
  { id: "lucknow", name: "Lucknow Super Giants", monogram: "LSG", color: "#A72056" },
  { id: "ahmedabad", name: "Gujarat Titans", monogram: "GT", color: "#1C1C1C" },
] as const;

export type FranchiseId = typeof FRANCHISES[number]["id"];
