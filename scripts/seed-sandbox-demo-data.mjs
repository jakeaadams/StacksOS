import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf("=");
    if (idx <= 0) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1);
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

function loadEnv() {
  const root = path.join(__dirname, "..");
  const env = {
    ...readEnvFile(path.join(root, ".env")),
    ...readEnvFile(path.join(root, ".env.local")),
  };
  for (const [k, v] of Object.entries(env)) {
    if (process.env[k] === undefined) process.env[k] = v;
  }
}

class CookieJar {
  constructor() {
    this.cookies = new Map();
  }
  setFromSetCookie(setCookieValue) {
    if (!setCookieValue || typeof setCookieValue !== "string") return;
    const first = setCookieValue.split(";")[0];
    const eq = first.indexOf("=");
    if (eq <= 0) return;
    const name = first.slice(0, eq).trim();
    const value = first.slice(eq + 1).trim();
    if (!name) return;
    this.cookies.set(name, value);
  }
  applyResponseCookies(res) {
    const sc = res.headers.getSetCookie ? res.headers.getSetCookie() : null;
    if (Array.isArray(sc)) {
      for (const v of sc) this.setFromSetCookie(v);
      return;
    }
    const single = res.headers.get("set-cookie");
    if (single) this.setFromSetCookie(single);
  }
  header() {
    if (this.cookies.size === 0) return "";
    return Array.from(this.cookies.entries())
      .map(([k, v]) => `${k}=${v}`)
      .join("; ");
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/* -------------------------------------------------------------------------- */
/*  Realistic Demo Library Data                                                */
/* -------------------------------------------------------------------------- */

const DEMO_PATRONS = [
  { first: "Maria", last: "Gonzalez" },
  { first: "James", last: "Chen" },
  { first: "Aisha", last: "Patel" },
  { first: "Robert", last: "Williams" },
  { first: "Yuki", last: "Tanaka" },
  { first: "Sarah", last: "O'Brien" },
  { first: "Kwame", last: "Asante" },
  { first: "Emily", last: "Thompson" },
  { first: "Carlos", last: "Rivera" },
  { first: "Priya", last: "Sharma" },
  { first: "David", last: "Kim" },
  { first: "Fatima", last: "Al-Rashid" },
  { first: "Marcus", last: "Johnson" },
  { first: "Olga", last: "Petrov" },
  { first: "Liam", last: "McCarthy" },
  { first: "Mei", last: "Wong" },
  { first: "Andre", last: "Baptiste" },
  { first: "Sofia", last: "Rossi" },
  { first: "Jamal", last: "Washington" },
  { first: "Hannah", last: "Goldstein" },
  { first: "Raj", last: "Kapoor" },
  { first: "Elena", last: "Vasquez" },
  { first: "Thomas", last: "Anderson" },
  { first: "Amara", last: "Okafor" },
];

const DEMO_CATALOG = [
  // --- Fiction (40) ---
  { title: "The Night Gardener", author: "Ainsley, Jonathan", publisher: "Harper Perennial", year: "2023", subjects: ["Fiction", "Literary Fiction"], callPrefix: "FIC", format: "book" },
  { title: "A Thousand Shores", author: "Delgado, Elena", publisher: "Knopf", year: "2024", subjects: ["Fiction", "Historical Fiction"], callPrefix: "FIC", format: "book" },
  { title: "The Cartographer's Daughter", author: "Okonkwo, Nnedi", publisher: "Penguin", year: "2022", subjects: ["Fiction", "Fantasy"], callPrefix: "FIC", format: "book" },
  { title: "Midnight in the Garden District", author: "Beaumont, Claire", publisher: "Little, Brown", year: "2023", subjects: ["Fiction", "Mystery"], callPrefix: "FIC", format: "book" },
  { title: "Rivers of Starlight", author: "Chang, David", publisher: "Tor Books", year: "2024", subjects: ["Fiction", "Science Fiction"], callPrefix: "FIC", format: "book" },
  { title: "Where the Lemon Trees Grow", author: "Ferrante, Marco", publisher: "Scribner", year: "2021", subjects: ["Fiction", "Literary Fiction"], callPrefix: "FIC", format: "book" },
  { title: "The Lost Summer", author: "Morrison, Kate", publisher: "Vintage", year: "2023", subjects: ["Fiction", "Coming of Age"], callPrefix: "FIC", format: "book" },
  { title: "Beneath Still Waters", author: "Lindqvist, Erik", publisher: "Doubleday", year: "2022", subjects: ["Fiction", "Thriller"], callPrefix: "FIC", format: "book" },
  { title: "The Beekeeper's Promise", author: "Novak, Anna", publisher: "Ballantine", year: "2024", subjects: ["Fiction", "Historical Fiction"], callPrefix: "FIC", format: "book" },
  { title: "Paper Lanterns", author: "Tanaka, Haruki", publisher: "Grove Press", year: "2023", subjects: ["Fiction", "Literary Fiction"], callPrefix: "FIC", format: "book" },
  { title: "The Architect of Ruins", author: "Castellano, Rosa", publisher: "FSG", year: "2022", subjects: ["Fiction", "Literary Fiction"], callPrefix: "FIC", format: "book" },
  { title: "Salt and Shadow", author: "Adeyemi, Tunde", publisher: "Orbit", year: "2024", subjects: ["Fiction", "Fantasy"], callPrefix: "FIC", format: "book" },
  { title: "The Glass Forest", author: "Bergman, Ingrid", publisher: "Ecco", year: "2023", subjects: ["Fiction", "Suspense"], callPrefix: "FIC", format: "book" },
  { title: "Echoes of the River", author: "Redhawk, Elaine", publisher: "Algonquin", year: "2021", subjects: ["Fiction", "Indigenous Fiction"], callPrefix: "FIC", format: "book" },
  { title: "City of Jasmine", author: "Al-Masri, Leila", publisher: "Viking", year: "2024", subjects: ["Fiction", "Contemporary"], callPrefix: "FIC", format: "book" },
  { title: "The Winter Sailor", author: "Gallagher, Sean", publisher: "Norton", year: "2022", subjects: ["Fiction", "Adventure"], callPrefix: "FIC", format: "book" },
  { title: "Dancing in the Margins", author: "Reyes, Carmen", publisher: "Random House", year: "2023", subjects: ["Fiction", "Literary Fiction"], callPrefix: "FIC", format: "book" },
  { title: "The Ninth Station", author: "Volkov, Dimitri", publisher: "Putnam", year: "2024", subjects: ["Fiction", "Espionage"], callPrefix: "FIC", format: "book" },
  { title: "Wildflower Season", author: "Park, Jisoo", publisher: "Atria", year: "2023", subjects: ["Fiction", "Romance"], callPrefix: "FIC", format: "book" },
  { title: "The Lighthouse Keeper", author: "Sutherland, Fiona", publisher: "Houghton Mifflin", year: "2022", subjects: ["Fiction", "Historical Fiction"], callPrefix: "FIC", format: "book" },
  { title: "Amber and Iron", author: "Nwosu, Chidera", publisher: "Del Rey", year: "2024", subjects: ["Fiction", "Fantasy"], callPrefix: "FIC", format: "book" },
  { title: "The Philosopher's Garden", author: "Werner, Friedrich", publisher: "Riverhead", year: "2023", subjects: ["Fiction", "Literary Fiction"], callPrefix: "FIC", format: "book" },
  { title: "Last Train from Lisbon", author: "Coelho, Beatriz", publisher: "Harper", year: "2021", subjects: ["Fiction", "WWII Fiction"], callPrefix: "FIC", format: "book" },
  { title: "The Memory Thief", author: "Andersen, Nils", publisher: "Ace", year: "2024", subjects: ["Fiction", "Science Fiction"], callPrefix: "FIC", format: "book" },
  { title: "Still Life with Oranges", author: "Moreau, Isabelle", publisher: "Pantheon", year: "2023", subjects: ["Fiction", "Literary Fiction"], callPrefix: "FIC", format: "book" },
  { title: "The Storm Weaver", author: "McKenna, Ciara", publisher: "DAW", year: "2022", subjects: ["Fiction", "Fantasy"], callPrefix: "FIC", format: "book" },
  { title: "Copper Sky", author: "Begay, Daniel", publisher: "Milkweed", year: "2024", subjects: ["Fiction", "Western"], callPrefix: "FIC", format: "book" },
  { title: "The Violin Maker's Apprentice", author: "Bianchi, Luca", publisher: "Knopf", year: "2023", subjects: ["Fiction", "Historical Fiction"], callPrefix: "FIC", format: "book" },
  { title: "Threads of Indigo", author: "Khatri, Deepa", publisher: "Bloomsbury", year: "2022", subjects: ["Fiction", "Literary Fiction"], callPrefix: "FIC", format: "book" },
  { title: "The Apothecary's Widow", author: "Laurent, Marie", publisher: "Crown", year: "2024", subjects: ["Fiction", "Mystery"], callPrefix: "FIC", format: "book" },
  { title: "Sunken City", author: "Morales, Gabriel", publisher: "Tor", year: "2023", subjects: ["Fiction", "Science Fiction"], callPrefix: "FIC", format: "book" },
  { title: "The Painter's Muse", author: "Fournier, Sophie", publisher: "Scribner", year: "2021", subjects: ["Fiction", "Art Fiction"], callPrefix: "FIC", format: "book" },
  { title: "Ice and Embers", author: "Johansson, Lars", publisher: "Saga Press", year: "2024", subjects: ["Fiction", "Fantasy"], callPrefix: "FIC", format: "book" },
  { title: "The Tea Garden", author: "Liang, Mei-Ying", publisher: "Penguin", year: "2023", subjects: ["Fiction", "Literary Fiction"], callPrefix: "FIC", format: "book" },
  { title: "Harbor Lights", author: "Sullivan, Patrick", publisher: "William Morrow", year: "2022", subjects: ["Fiction", "Family Saga"], callPrefix: "FIC", format: "book" },
  { title: "The Mapmaker's Secret", author: "Torres, Miguel", publisher: "Simon & Schuster", year: "2024", subjects: ["Fiction", "Adventure"], callPrefix: "FIC", format: "book" },
  { title: "Persephone's Garden", author: "Papadopoulos, Elena", publisher: "Ecco", year: "2023", subjects: ["Fiction", "Mythology"], callPrefix: "FIC", format: "book" },
  { title: "The Sandpiper's Song", author: "Whitfield, Grace", publisher: "Anchor", year: "2021", subjects: ["Fiction", "Southern Fiction"], callPrefix: "FIC", format: "book" },
  { title: "Kingdom of Dust", author: "Farsi, Reza", publisher: "Vintage", year: "2024", subjects: ["Fiction", "Literary Fiction"], callPrefix: "FIC", format: "book" },
  { title: "The Bookshop at the End of the World", author: "Murphy, Ronan", publisher: "Ballantine", year: "2023", subjects: ["Fiction", "Magical Realism"], callPrefix: "FIC", format: "book" },
  // --- Non-Fiction (35) ---
  { title: "The Hidden Life of Trees", author: "Wohlleben, Peter", publisher: "Greystone Books", year: "2016", subjects: ["Science", "Nature", "Ecology"], callPrefix: "577.3", format: "book" },
  { title: "Atomic Habits", author: "Clear, James", publisher: "Avery", year: "2018", subjects: ["Self-Help", "Psychology", "Productivity"], callPrefix: "158.1", format: "book" },
  { title: "Sapiens: A Brief History of Humankind", author: "Harari, Yuval Noah", publisher: "Harper", year: "2015", subjects: ["History", "Anthropology"], callPrefix: "909", format: "book" },
  { title: "The Body: A Guide for Occupants", author: "Bryson, Bill", publisher: "Doubleday", year: "2019", subjects: ["Science", "Medicine", "Human Body"], callPrefix: "612", format: "book" },
  { title: "Braiding Sweetgrass", author: "Kimmerer, Robin Wall", publisher: "Milkweed", year: "2013", subjects: ["Nature", "Indigenous Knowledge", "Botany"], callPrefix: "581.6", format: "book" },
  { title: "The Art of Gathering", author: "Parker, Priya", publisher: "Riverhead", year: "2018", subjects: ["Social Science", "Community"], callPrefix: "302.3", format: "book" },
  { title: "Entangled Life", author: "Sheldrake, Merlin", publisher: "Random House", year: "2020", subjects: ["Science", "Mycology", "Biology"], callPrefix: "579.5", format: "book" },
  { title: "Four Thousand Weeks", author: "Burkeman, Oliver", publisher: "FSG", year: "2021", subjects: ["Philosophy", "Time Management"], callPrefix: "304.2", format: "book" },
  { title: "The Invention of Nature", author: "Wulf, Andrea", publisher: "Knopf", year: "2015", subjects: ["Biography", "Science", "History"], callPrefix: "508.092", format: "book" },
  { title: "Breath: The New Science of a Lost Art", author: "Nestor, James", publisher: "Riverhead", year: "2020", subjects: ["Health", "Science", "Breathing"], callPrefix: "613.192", format: "book" },
  { title: "How to Change Your Mind", author: "Pollan, Michael", publisher: "Penguin", year: "2018", subjects: ["Psychology", "Neuroscience"], callPrefix: "615.7", format: "book" },
  { title: "The Library Book", author: "Orlean, Susan", publisher: "Simon & Schuster", year: "2018", subjects: ["Libraries", "History", "True Crime"], callPrefix: "027.479", format: "book" },
  { title: "An Immense World", author: "Yong, Ed", publisher: "Random House", year: "2022", subjects: ["Science", "Biology", "Animal Senses"], callPrefix: "591.5", format: "book" },
  { title: "Empire of Pain", author: "Keefe, Patrick Radden", publisher: "Doubleday", year: "2021", subjects: ["Biography", "Medicine", "Business"], callPrefix: "338.7", format: "book" },
  { title: "The Dawn of Everything", author: "Graeber, David", publisher: "FSG", year: "2021", subjects: ["Anthropology", "History", "Social Science"], callPrefix: "930.1", format: "book" },
  { title: "Noise: A Flaw in Human Judgment", author: "Kahneman, Daniel", publisher: "Little, Brown", year: "2021", subjects: ["Psychology", "Decision Making"], callPrefix: "153.4", format: "book" },
  { title: "All About Love", author: "hooks, bell", publisher: "William Morrow", year: "2000", subjects: ["Philosophy", "Relationships", "Self-Help"], callPrefix: "306.7", format: "book" },
  { title: "The Code Breaker", author: "Isaacson, Walter", publisher: "Simon & Schuster", year: "2021", subjects: ["Biography", "Science", "Genetics"], callPrefix: "572.8", format: "book" },
  { title: "Under a White Sky", author: "Kolbert, Elizabeth", publisher: "Crown", year: "2021", subjects: ["Science", "Environment", "Climate"], callPrefix: "304.2", format: "book" },
  { title: "Crying in H Mart", author: "Zauner, Michelle", publisher: "Knopf", year: "2021", subjects: ["Memoir", "Food", "Identity"], callPrefix: "B ZAU", format: "book" },
  { title: "The Premonition", author: "Lewis, Michael", publisher: "Norton", year: "2021", subjects: ["Science", "Public Health", "COVID-19"], callPrefix: "362.1", format: "book" },
  { title: "Atlas of the Heart", author: "Brown, Brene", publisher: "Random House", year: "2021", subjects: ["Psychology", "Emotions", "Self-Help"], callPrefix: "152.4", format: "book" },
  { title: "The Extended Mind", author: "Paul, Annie Murphy", publisher: "Houghton Mifflin", year: "2021", subjects: ["Psychology", "Cognition", "Neuroscience"], callPrefix: "153", format: "book" },
  { title: "Saving Us: A Climate Scientist's Case for Hope", author: "Hayhoe, Katharine", publisher: "Atria", year: "2021", subjects: ["Science", "Climate Change"], callPrefix: "363.738", format: "book" },
  { title: "Caste: The Origins of Our Discontents", author: "Wilkerson, Isabel", publisher: "Random House", year: "2020", subjects: ["Social Science", "History", "Race"], callPrefix: "305.5", format: "book" },
  { title: "Quiet: The Power of Introverts", author: "Cain, Susan", publisher: "Crown", year: "2012", subjects: ["Psychology", "Personality"], callPrefix: "155.2", format: "book" },
  { title: "Thinking, Fast and Slow", author: "Kahneman, Daniel", publisher: "FSG", year: "2011", subjects: ["Psychology", "Economics"], callPrefix: "153.4", format: "book" },
  { title: "The Warmth of Other Suns", author: "Wilkerson, Isabel", publisher: "Vintage", year: "2010", subjects: ["History", "Migration", "African American"], callPrefix: "307.2", format: "book" },
  { title: "Born a Crime", author: "Noah, Trevor", publisher: "Spiegel & Grau", year: "2016", subjects: ["Memoir", "Humor", "South Africa"], callPrefix: "B NOA", format: "book" },
  { title: "Educated", author: "Westover, Tara", publisher: "Random House", year: "2018", subjects: ["Memoir", "Education"], callPrefix: "B WES", format: "book" },
  { title: "Becoming", author: "Obama, Michelle", publisher: "Crown", year: "2018", subjects: ["Memoir", "Biography"], callPrefix: "B OBA", format: "book" },
  { title: "The Immortal Life of Henrietta Lacks", author: "Skloot, Rebecca", publisher: "Crown", year: "2010", subjects: ["Science", "Biography", "Ethics"], callPrefix: "616.027", format: "book" },
  { title: "When Breath Becomes Air", author: "Kalanithi, Paul", publisher: "Random House", year: "2016", subjects: ["Memoir", "Medicine"], callPrefix: "B KAL", format: "book" },
  { title: "The Sixth Extinction", author: "Kolbert, Elizabeth", publisher: "Henry Holt", year: "2014", subjects: ["Science", "Environment", "Extinction"], callPrefix: "576.8", format: "book" },
  { title: "Between the World and Me", author: "Coates, Ta-Nehisi", publisher: "Spiegel & Grau", year: "2015", subjects: ["Social Science", "Race", "Memoir"], callPrefix: "305.896", format: "book" },
  // --- Children & YA (20) ---
  { title: "The Wild Robot", author: "Brown, Peter", publisher: "Little, Brown Young Readers", year: "2016", subjects: ["Juvenile Fiction", "Robots", "Nature"], callPrefix: "J FIC", format: "book" },
  { title: "New Kid", author: "Craft, Jerry", publisher: "Quill Tree Books", year: "2019", subjects: ["Juvenile Fiction", "Graphic Novel", "Diversity"], callPrefix: "J GN", format: "book" },
  { title: "The One and Only Ivan", author: "Applegate, Katherine", publisher: "Harper", year: "2012", subjects: ["Juvenile Fiction", "Animals"], callPrefix: "J FIC", format: "book" },
  { title: "Amari and the Night Brothers", author: "Alston, B. B.", publisher: "Balzer + Bray", year: "2021", subjects: ["Juvenile Fiction", "Fantasy", "Adventure"], callPrefix: "J FIC", format: "book" },
  { title: "Wings of Fire: The Dragonet Prophecy", author: "Sutherland, Tui T.", publisher: "Scholastic", year: "2012", subjects: ["Juvenile Fiction", "Fantasy", "Dragons"], callPrefix: "J FIC", format: "book" },
  { title: "Front Desk", author: "Yang, Kelly", publisher: "Scholastic", year: "2018", subjects: ["Juvenile Fiction", "Immigration", "Family"], callPrefix: "J FIC", format: "book" },
  { title: "A Wrinkle in Time", author: "L'Engle, Madeleine", publisher: "FSG", year: "1962", subjects: ["Juvenile Fiction", "Science Fiction", "Classics"], callPrefix: "J FIC", format: "book" },
  { title: "Diary of a Wimpy Kid", author: "Kinney, Jeff", publisher: "Amulet Books", year: "2007", subjects: ["Juvenile Fiction", "Humor"], callPrefix: "J FIC", format: "book" },
  { title: "Dog Man: The Epic Collection", author: "Pilkey, Dav", publisher: "Graphix", year: "2018", subjects: ["Juvenile Fiction", "Graphic Novel", "Humor"], callPrefix: "J GN", format: "book" },
  { title: "The Last Cuentista", author: "Higuera, Donna Barba", publisher: "Levine Querido", year: "2021", subjects: ["Juvenile Fiction", "Science Fiction", "Folklore"], callPrefix: "J FIC", format: "book" },
  { title: "Children of Blood and Bone", author: "Adeyemi, Tomi", publisher: "Henry Holt", year: "2018", subjects: ["Young Adult", "Fantasy", "African Mythology"], callPrefix: "YA FIC", format: "book" },
  { title: "The Hunger Games", author: "Collins, Suzanne", publisher: "Scholastic", year: "2008", subjects: ["Young Adult", "Dystopian", "Science Fiction"], callPrefix: "YA FIC", format: "book" },
  { title: "Six of Crows", author: "Bardugo, Leigh", publisher: "Henry Holt", year: "2015", subjects: ["Young Adult", "Fantasy", "Heist"], callPrefix: "YA FIC", format: "book" },
  { title: "The Hate U Give", author: "Thomas, Angie", publisher: "Balzer + Bray", year: "2017", subjects: ["Young Adult", "Contemporary", "Social Justice"], callPrefix: "YA FIC", format: "book" },
  { title: "Legendborn", author: "Deonn, Tracy", publisher: "Simon & Schuster", year: "2020", subjects: ["Young Adult", "Fantasy", "Arthurian Legend"], callPrefix: "YA FIC", format: "book" },
  { title: "Percy Jackson and the Lightning Thief", author: "Riordan, Rick", publisher: "Disney Hyperion", year: "2005", subjects: ["Juvenile Fiction", "Mythology", "Adventure"], callPrefix: "J FIC", format: "book" },
  { title: "Stamped: Racism, Antiracism, and You", author: "Reynolds, Jason", publisher: "Little, Brown", year: "2020", subjects: ["Young Adult", "Nonfiction", "History", "Race"], callPrefix: "YA 305.8", format: "book" },
  { title: "Fry Bread: A Native American Family Story", author: "Maillard, Kevin Noble", publisher: "Roaring Brook", year: "2019", subjects: ["Juvenile Picture Book", "Indigenous Culture", "Food"], callPrefix: "JP", format: "book" },
  { title: "The Crossover", author: "Alexander, Kwame", publisher: "Houghton Mifflin", year: "2014", subjects: ["Juvenile Fiction", "Sports", "Poetry"], callPrefix: "J FIC", format: "book" },
  { title: "Restart", author: "Korman, Gordon", publisher: "Scholastic", year: "2017", subjects: ["Juvenile Fiction", "Bullying", "Memory Loss"], callPrefix: "J FIC", format: "book" },
  // --- Media (15) ---
  { title: "National Parks of the American West", author: "Nature Films Collection", publisher: "PBS", year: "2022", subjects: ["Documentary", "Nature", "Travel"], callPrefix: "DVD 917", format: "dvd" },
  { title: "The Story of Jazz", author: "Burns, Ken", publisher: "PBS", year: "2021", subjects: ["Documentary", "Music", "History"], callPrefix: "DVD 781.65", format: "dvd" },
  { title: "Ocean Wonders: Deep Sea Exploration", author: "Blue Planet Productions", publisher: "BBC", year: "2023", subjects: ["Documentary", "Science", "Ocean"], callPrefix: "DVD 551.46", format: "dvd" },
  { title: "Ancient Civilizations: Egypt to Rome", author: "History Channel Classics", publisher: "A&E Home Video", year: "2020", subjects: ["Documentary", "History", "Archaeology"], callPrefix: "DVD 930", format: "dvd" },
  { title: "Cooking with Julia", author: "Child, Julia", publisher: "WGBH Boston", year: "2019", subjects: ["Cooking", "Television"], callPrefix: "DVD 641.5", format: "dvd" },
  { title: "The Midnight Library", author: "Haig, Matt", publisher: "Penguin Audio", year: "2020", subjects: ["Fiction", "Audiobook"], callPrefix: "AB FIC", format: "audiobook" },
  { title: "Project Hail Mary", author: "Weir, Andy", publisher: "Audible", year: "2021", subjects: ["Fiction", "Science Fiction", "Audiobook"], callPrefix: "AB FIC", format: "audiobook" },
  { title: "The Lincoln Highway", author: "Towles, Amor", publisher: "Penguin Audio", year: "2021", subjects: ["Fiction", "Historical Fiction", "Audiobook"], callPrefix: "AB FIC", format: "audiobook" },
  { title: "Think Again", author: "Grant, Adam", publisher: "Penguin Audio", year: "2021", subjects: ["Psychology", "Audiobook"], callPrefix: "AB 153.4", format: "audiobook" },
  { title: "Greenlights", author: "McConaughey, Matthew", publisher: "Random House Audio", year: "2020", subjects: ["Memoir", "Audiobook"], callPrefix: "AB B MCC", format: "audiobook" },
  // --- Large Print & Spanish (10) ---
  { title: "The Thursday Murder Club", author: "Osman, Richard", publisher: "Large Print Press", year: "2022", subjects: ["Fiction", "Mystery", "Large Print"], callPrefix: "LP FIC", format: "large_print" },
  { title: "The Maid", author: "Prose, Nita", publisher: "Large Print Press", year: "2022", subjects: ["Fiction", "Mystery", "Large Print"], callPrefix: "LP FIC", format: "large_print" },
  { title: "Lessons in Chemistry", author: "Garmus, Bonnie", publisher: "Large Print Press", year: "2022", subjects: ["Fiction", "Historical Fiction", "Large Print"], callPrefix: "LP FIC", format: "large_print" },
  { title: "La casa de los espiritus", author: "Allende, Isabel", publisher: "Plaza & Janes", year: "1982", subjects: ["Fiction", "Spanish Language", "Magical Realism"], callPrefix: "SP FIC", format: "book" },
  { title: "Cien anos de soledad", author: "Garcia Marquez, Gabriel", publisher: "Editorial Sudamericana", year: "1967", subjects: ["Fiction", "Spanish Language", "Classics"], callPrefix: "SP FIC", format: "book" },
  { title: "Como agua para chocolate", author: "Esquivel, Laura", publisher: "Doubleday", year: "1989", subjects: ["Fiction", "Spanish Language", "Romance"], callPrefix: "SP FIC", format: "book" },
  { title: "El alquimista", author: "Coelho, Paulo", publisher: "HarperCollins Espanol", year: "1988", subjects: ["Fiction", "Spanish Language", "Adventure"], callPrefix: "SP FIC", format: "book" },
  { title: "La sombra del viento", author: "Ruiz Zafon, Carlos", publisher: "Planeta", year: "2001", subjects: ["Fiction", "Spanish Language", "Mystery"], callPrefix: "SP FIC", format: "book" },
  { title: "The Personal Librarian", author: "Benedict, Marie", publisher: "Large Print Press", year: "2021", subjects: ["Fiction", "Historical Fiction", "Large Print"], callPrefix: "LP FIC", format: "large_print" },
  { title: "Tomorrow, and Tomorrow, and Tomorrow", author: "Zevin, Gabrielle", publisher: "Large Print Press", year: "2022", subjects: ["Fiction", "Technology", "Large Print"], callPrefix: "LP FIC", format: "large_print" },
];

async function fetchJson(url, { method = "GET", headers = {}, json, jar, csrfToken, retries = 5 } = {}) {
  const finalHeaders = { ...headers };
  if (jar) {
    const cookie = jar.header();
    if (cookie) finalHeaders.cookie = cookie;
  }
  if (method !== "GET" && csrfToken) {
    finalHeaders["x-csrf-token"] = csrfToken;
  }
  if (json !== undefined) {
    finalHeaders["content-type"] = "application/json";
  }

  for (let attempt = 1; attempt <= retries; attempt++) {
    const res = await fetch(url, {
      method,
      headers: finalHeaders,
      body: json !== undefined ? JSON.stringify(json) : undefined,
    });
    if (jar) jar.applyResponseCookies(res);

    const text = await res.text();
    let data;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      throw new Error(`Non-JSON response for ${method} ${url}: ${text.slice(0, 200)}`);
    }

    if (res.status === 429 && attempt < retries) {
      const retryAfter = res.headers.get("retry-after");
      const waitMsRaw = retryAfter ? Number(retryAfter) * 1000 : 250 * 2 ** (attempt - 1);
      const maxWaitMs = 30 * 1000; // keep demo resets deterministic (avoid multi-minute stalls)
      const waitMs = Number.isFinite(waitMsRaw) ? Math.min(maxWaitMs, Math.max(250, waitMsRaw)) : 1000;
      console.warn(`[seed] 429 from ${method} ${url}; retrying in ${waitMs}ms (attempt ${attempt}/${retries})`);
      await sleep(waitMs);
      continue;
    }

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} for ${method} ${url}: ${JSON.stringify(data).slice(0, 300)}`);
    }

    return data;
  }

  throw new Error(`Exceeded retry limit for ${method} ${url}`);
}

function isoNow() {
  return new Date().toISOString();
}

function padDigits(value, width) {
  const s = String(value);
  if (s.length >= width) return s;
  return "0".repeat(width - s.length) + s;
}

function defaultHours() {
  const closed = { open: null, close: null, note: null };
  const open = { open: "09:00", close: "17:00", note: null };
  return {
    dow0: closed,
    dow1: open,
    dow2: open,
    dow3: open,
    dow4: open,
    dow5: open,
    dow6: closed,
  };
}

async function ensureWorkstation({ baseUrl, jar, csrfToken, orgId, workstation }) {
  try {
    const wsList = await fetchJson(`${baseUrl}/api/evergreen/workstations?org_id=${orgId}`, { jar });
    const existing = Array.isArray(wsList?.workstations)
      ? wsList.workstations.find((w) => String(w.name || "").toLowerCase() === workstation.toLowerCase())
      : null;
    if (existing) return;

    await fetchJson(`${baseUrl}/api/evergreen/workstations`, {
      method: "POST",
      jar,
      csrfToken,
      json: { name: workstation, org_id: String(orgId) },
    });
    console.log(`[seed] registered workstation ${workstation}`);
  } catch (e) {
    // If the list endpoint is broken (or perms differ), just treat this as best-effort.
    console.warn(`[seed] workstation ensure skipped: ${String(e).slice(0, 160)}`);
  }
}

async function ensurePatron({ baseUrl, jar, csrfToken, orgId, barcode, username, firstName, lastName, pin }) {
  try {
    const existing = await fetchJson(`${baseUrl}/api/evergreen/patrons?barcode=${encodeURIComponent(barcode)}`, { jar });
    const patronId = existing?.patron?.id ?? null;
    if (pin && patronId) {
      // Ensure the demo patron PIN/password is deterministic for OPAC E2E runs.
      await fetchJson(`${baseUrl}/api/evergreen/patrons`, {
        method: "PUT",
        jar,
        csrfToken,
        json: { id: patronId, password: pin },
      });
    }
    return { created: false, id: patronId };
  } catch {
    const created = await fetchJson(`${baseUrl}/api/evergreen/patrons`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        firstName,
        lastName,
        barcode,
        username,
        password: pin || "DEMO1234",
        email: `${username}@example.org`,
        homeLibrary: orgId,
        address: {
          street1: "1 Demo Street",
          city: "Sandbox",
          state: "CA",
          post_code: "94105",
          country: "US",
        },
      },
    });
    void created;
    return { created: true, id: created?.patron?.id ?? null };
  }
}

async function ensureCatalogSeed({ baseUrl, jar, csrfToken, orgId, forceRecreate }) {
  const root = path.join(__dirname, "..");
  const demoDataPath = path.join(root, "audit", "demo_data.json");
  const previousDemoItemBarcode = (() => {
    try {
      if (!fs.existsSync(demoDataPath)) return null;
      const parsed = JSON.parse(fs.readFileSync(demoDataPath, "utf8"));
      return typeof parsed?.demoItemBarcode === "string" ? parsed.demoItemBarcode : null;
    } catch {
      return null;
    }
  })();

  if (!forceRecreate && previousDemoItemBarcode) {
    try {
      await fetchJson(`${baseUrl}/api/evergreen/items?barcode=${encodeURIComponent(previousDemoItemBarcode)}`, { jar });
      console.log(`[seed] found existing demo item ${previousDemoItemBarcode}; skipping bib/copy creation`);
      return { createdBibIds: [], copiesCreated: 0, firstCopyBarcode: previousDemoItemBarcode };
    } catch {
      // proceed to create
    }
  }

  const bibCount = Number(process.env.DEMO_BIB_COUNT || 100);
  const copiesPerBib = Number(process.env.DEMO_COPIES_PER_BIB || 2);

  const createdBibIds = [];
  let copiesCreated = 0;
  const baseBarcode = 39000001000000n;
  let copyCounter = 0n;
  let firstCopyBarcode = null;

  for (let i = 1; i <= bibCount; i++) {
    const entry = DEMO_CATALOG[i - 1] || {
      title: `Library Collection Item ${padDigits(i, 3)}`,
      author: "Various Authors",
      publisher: "General Press",
      subjects: ["General"],
      format: "book",
    };
    const isbn = `978${padDigits(i, 10)}`.slice(0, 13);
    const pubYear = entry.year || String(2000 + (i % 25));
    const callPrefix = entry.callPrefix || "FIC";

    const created = await fetchJson(`${baseUrl}/api/evergreen/catalog`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        action: "create",
        simplified: {
          title: entry.title,
          author: entry.author,
          isbn,
          publisher: entry.publisher,
          pubYear,
          subjects: entry.subjects,
          format: entry.format || "book",
        },
      },
    });

    const bibId = created?.id;
    if (!bibId) throw new Error(`Failed to create demo bib for ${entry.title}`);
    createdBibIds.push(bibId);

    for (let c = 0; c < copiesPerBib; c++) {
      const barcode = String(baseBarcode + copyCounter);
      copyCounter += 1n;
      const price = entry.format === "dvd" ? 19.99 : entry.format === "audiobook" ? 29.99 : 24.95;
      try {
        const res = await fetchJson(`${baseUrl}/api/evergreen/items`, {
          method: "POST",
          jar,
          csrfToken,
          json: {
            bibId,
            barcode,
            callNumber: `${callPrefix} ${entry.author.split(",")[0].toUpperCase().slice(0, 3)}`,
            circLib: orgId,
            owningLib: orgId,
            locationId: 1,
            status: 0,
            circulate: true,
            holdable: true,
            opacVisible: true,
            price,
          },
        });
        void res;
        copiesCreated += 1;
        if (!firstCopyBarcode) firstCopyBarcode = barcode;
      } catch (e) {
        console.warn(`[seed] item create failed (barcode=${barcode}): ${String(e).slice(0, 160)}`);
      }
    }

    if (i % 10 === 0) console.log(`[seed] created ${i}/${bibCount} bibs...`);
  }

  return { createdBibIds, copiesCreated, firstCopyBarcode };
}

async function ensureCalendarVersion({ baseUrl, jar, csrfToken, orgId }) {
  try {
    const cal = await fetchJson(`${baseUrl}/api/evergreen/calendars?org_id=${orgId}`, { jar });
    const versions = Array.isArray(cal?.versions) ? cal.versions : [];
    if (versions.length > 0) return { seeded: false, versionId: versions[0]?.id ?? null };

    const snapshot = cal?.snapshot || {};
    const hours = snapshot?.hours || defaultHours();
    const closedDates = Array.isArray(snapshot?.closed) ? snapshot.closed : [];

    const updated = await fetchJson(`${baseUrl}/api/evergreen/calendars`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        action: "update",
        orgId,
        note: "Seeded by StacksOS sandbox demo data",
        hours,
        closedDates,
      },
    });
    const id = updated?.versionId ?? null;
    console.log("[seed] created calendar version");
    return { seeded: true, versionId: id };
  } catch (e) {
    console.warn(`[seed] calendar version seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false, versionId: null };
  }
}

async function ensureOrgSetting({ baseUrl, jar, csrfToken, orgId }) {
  try {
    const settings = await fetchJson(
      `${baseUrl}/api/evergreen/admin-settings?type=org_settings&org_id=${orgId}&limit=25`,
      { jar }
    );
    const rows = Array.isArray(settings?.settings) ? settings.settings : [];
    const settingName = "acq.copy_creator_uses_receiver";
    if (rows.some((s) => s?.name === settingName)) return { seeded: false };

    await fetchJson(`${baseUrl}/api/evergreen/admin-settings`, {
      method: "POST",
      jar,
      csrfToken,
      json: { action: "update", type: "org_setting", orgId, data: { name: settingName, value: true } },
    });
    console.log("[seed] set org unit setting");
    return { seeded: true };
  } catch (e) {
    console.warn(`[seed] org setting seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false };
  }
}

async function ensureCircModifier({ baseUrl, jar, csrfToken }) {
  const code = "STACKSOS_DEMO";
  try {
    const list = await fetchJson(`${baseUrl}/api/evergreen/circ-modifiers`, { jar });
    const modifiers = Array.isArray(list?.modifiers) ? list.modifiers : [];
    if (modifiers.some((m) => String(m.code) === code)) return { code, seeded: false };

    await fetchJson(`${baseUrl}/api/evergreen/circ-modifiers`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        code,
        name: "StacksOS Demo",
        description: "Seeded circ modifier for StacksOS sandbox",
        sip2MediaType: "book",
        magneticMedia: false,
      },
    });
    console.log("[seed] created circ modifier");
    return { code, seeded: true };
  } catch (e) {
    console.warn(`[seed] circ modifier seed skipped: ${String(e).slice(0, 160)}`);
    return { code: null, seeded: false };
  }
}

async function ensureCopyTemplate({ baseUrl, jar, csrfToken, orgId, circModifierCode }) {
  try {
    const res = await fetchJson(`${baseUrl}/api/evergreen/templates?type=copy&org_id=${orgId}&limit=10`, { jar });
    const templates = Array.isArray(res?.templates) ? res.templates : [];
    if (templates.length > 0) return { seeded: false, id: templates[0]?.id ?? null };

    const statuses = Array.isArray(res?.statuses) ? res.statuses : [];
    const locations = Array.isArray(res?.locations) ? res.locations : [];
    const statusId = statuses[0]?.id ?? null;
    const locationId = locations[0]?.id ?? null;

    const created = await fetchJson(`${baseUrl}/api/evergreen/templates`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        action: "create",
        type: "copy",
        data: {
          name: "StacksOS Demo Copy Template",
          owningLib: orgId,
          circLib: orgId,
          status: statusId,
          location: locationId,
          circModifier: circModifierCode || null,
          circulate: true,
          holdable: true,
          opacVisible: true,
          ref: false,
          price: 0,
        },
      },
    });

    const id = created?.id ?? null;
    console.log("[seed] created copy template");
    return { seeded: true, id };
  } catch (e) {
    console.warn(`[seed] copy template seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false, id: null };
  }
}

async function ensureBucket({ baseUrl, jar, csrfToken, recordId }) {
  try {
    const buckets = await fetchJson(`${baseUrl}/api/evergreen/buckets`, { jar });
    if (Array.isArray(buckets?.buckets) && buckets.buckets.length > 0) return { seeded: false };

    const created = await fetchJson(`${baseUrl}/api/evergreen/buckets`, {
      method: "POST",
      jar,
      csrfToken,
      json: { action: "create", name: "StacksOS Demo Bucket", description: "Seeded by StacksOS demo data", pub: false },
    });

    const bucketId = created?.bucket?.id ?? null;
    if (bucketId && recordId) {
      await fetchJson(`${baseUrl}/api/evergreen/buckets`, {
        method: "POST",
        jar,
        csrfToken,
        json: { action: "add_record", bucketId, recordId },
      });
    }

    console.log("[seed] created record bucket");
    return { seeded: true, bucketId };
  } catch (e) {
    console.warn(`[seed] buckets seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false, bucketId: null };
  }
}

async function ensureCopyTags({ baseUrl, jar, csrfToken, orgId }) {
  try {
    const typeCode = "STACKSOS_DEMO";
    const types = await fetchJson(`${baseUrl}/api/evergreen/copy-tags/types`, { jar });
    const tagTypes = Array.isArray(types?.tagTypes) ? types.tagTypes : [];
    if (!tagTypes.some((t) => String(t.code) === typeCode)) {
      await fetchJson(`${baseUrl}/api/evergreen/copy-tags/types`, {
        method: "POST",
        jar,
        csrfToken,
        json: { code: typeCode, label: "StacksOS Demo", ownerId: orgId },
      });
      console.log("[seed] created copy tag type");
    }

    const tagsRes = await fetchJson(`${baseUrl}/api/evergreen/copy-tags`, { jar });
    const tags = Array.isArray(tagsRes?.tags) ? tagsRes.tags : [];
    if (!tags.some((t) => String(t.tagType) === typeCode && String(t.label).toLowerCase() === "demo tag")) {
      await fetchJson(`${baseUrl}/api/evergreen/copy-tags`, {
        method: "POST",
        jar,
        csrfToken,
        json: {
          tagType: typeCode,
          label: "Demo Tag",
          value: "StacksOS",
          staffNote: "Seeded by StacksOS demo data",
          pub: false,
          ownerId: orgId,
        },
      });
      console.log("[seed] created copy tag");
    }

    return { seeded: true };
  } catch (e) {
    console.warn(`[seed] copy tags seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false };
  }
}

async function ensureStatCategories({ baseUrl, jar, csrfToken, orgId }) {
  let demoCopyStatCatId = null;
  let demoPatronStatCatId = null;
  try {
    const cats = await fetchJson(`${baseUrl}/api/evergreen/stat-categories`, { jar });
    const copyCats = Array.isArray(cats?.copyCategories) ? cats.copyCategories : [];
    const patronCats = Array.isArray(cats?.patronCategories) ? cats.patronCategories : [];

    if (copyCats.length === 0) {
      const created = await fetchJson(`${baseUrl}/api/evergreen/stat-categories`, {
        method: "POST",
        jar,
        csrfToken,
        json: { kind: "copy", name: "StacksOS Demo (Copy)", ownerId: orgId, opacVisible: false, required: false },
      });
      demoCopyStatCatId = created?.id ?? null;
      console.log("[seed] created copy stat category");
    } else {
      demoCopyStatCatId = copyCats[0]?.id ?? null;
    }

    if (patronCats.length === 0) {
      const created = await fetchJson(`${baseUrl}/api/evergreen/stat-categories`, {
        method: "POST",
        jar,
        csrfToken,
        json: { kind: "patron", name: "StacksOS Demo (Patron)", ownerId: orgId, opacVisible: false, required: false },
      });
      demoPatronStatCatId = created?.id ?? null;
      console.log("[seed] created patron stat category");
    } else {
      demoPatronStatCatId = patronCats[0]?.id ?? null;
    }

    if (demoCopyStatCatId) {
      const entries = await fetchJson(
        `${baseUrl}/api/evergreen/stat-categories/entries?kind=copy&statCatId=${demoCopyStatCatId}`,
        { jar }
      );
      if (Array.isArray(entries?.entries) && entries.entries.length === 0) {
        await fetchJson(`${baseUrl}/api/evergreen/stat-categories/entries`, {
          method: "POST",
          jar,
          csrfToken,
          json: { kind: "copy", statCatId: demoCopyStatCatId, value: "StacksOS Demo", ownerId: orgId },
        });
        console.log("[seed] created copy stat category entry");
      }
    }

    if (demoPatronStatCatId) {
      const entries = await fetchJson(
        `${baseUrl}/api/evergreen/stat-categories/entries?kind=patron&statCatId=${demoPatronStatCatId}`,
        { jar }
      );
      if (Array.isArray(entries?.entries) && entries.entries.length === 0) {
        await fetchJson(`${baseUrl}/api/evergreen/stat-categories/entries`, {
          method: "POST",
          jar,
          csrfToken,
          json: { kind: "patron", statCatId: demoPatronStatCatId, value: "StacksOS Demo", ownerId: orgId },
        });
        console.log("[seed] created patron stat category entry");
      }
    }

    return { demoCopyStatCatId, demoPatronStatCatId };
  } catch (e) {
    console.warn(`[seed] stat categories seed skipped: ${String(e).slice(0, 160)}`);
    return { demoCopyStatCatId, demoPatronStatCatId };
  }
}

async function ensureCourseReserves({ baseUrl, jar, csrfToken, orgId }) {
  let demoCourseId = null;
  let demoTermId = null;
  try {
    const cr = await fetchJson(`${baseUrl}/api/evergreen/course-reserves`, { jar });
    const courses = Array.isArray(cr?.courses) ? cr.courses : [];
    const terms = Array.isArray(cr?.terms) ? cr.terms : [];

    if (terms.length === 0) {
      const created = await fetchJson(`${baseUrl}/api/evergreen/course-reserves`, {
        method: "POST",
        jar,
        csrfToken,
        json: {
          entity: "term",
          name: "StacksOS Demo Term",
          owningLibId: orgId,
          startDate: "2026-01-01",
          endDate: "2026-12-31",
        },
      });
      demoTermId = created?.id ?? null;
      console.log("[seed] created course reserves term");
    } else {
      demoTermId = terms[0]?.id ?? null;
    }

    if (courses.length === 0) {
      const created = await fetchJson(`${baseUrl}/api/evergreen/course-reserves`, {
        method: "POST",
        jar,
        csrfToken,
        json: {
          entity: "course",
          name: "StacksOS Demo Course",
          courseNumber: "STACKSOS-101",
          owningLibId: orgId,
          isArchived: false,
        },
      });
      demoCourseId = created?.id ?? null;
      console.log("[seed] created course reserves course");
    } else {
      demoCourseId = courses[0]?.id ?? null;
    }

    return { demoCourseId, demoTermId };
  } catch (e) {
    console.warn(`[seed] course reserves seed skipped: ${String(e).slice(0, 160)}`);
    return { demoCourseId, demoTermId };
  }
}

async function ensureScheduledReports({ baseUrl, jar, csrfToken, orgId }) {
  const recipient = process.env.DEMO_SCHEDULED_REPORT_EMAIL || "stacksos.demo.reports@example.org";
  try {
    const schedules = await fetchJson(`${baseUrl}/api/reports/scheduled`, { jar });
    const list = Array.isArray(schedules?.schedules) ? schedules.schedules : [];
    if (list.length > 0) return { demoScheduleId: list[0]?.id ?? null };

    const created = await fetchJson(`${baseUrl}/api/reports/scheduled`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        name: "Daily KPIs",
        reportKey: "dashboard_kpis",
        orgId,
        cadence: "daily",
        timeOfDay: "08:00",
        recipients: [recipient],
        enabled: true,
      },
    });
    const demoScheduleId = created?.id ?? null;
    console.log("[seed] created scheduled report schedule");
    return { demoScheduleId };
  } catch (e) {
    console.warn(`[seed] scheduled reports seed skipped: ${String(e).slice(0, 160)}`);
    return { demoScheduleId: null };
  }
}

async function ensureAcqInvoice({ baseUrl, jar, csrfToken, orgId }) {
  try {
    const invoices = await fetchJson(`${baseUrl}/api/evergreen/acquisitions?action=invoices`, { jar });
    const list = Array.isArray(invoices?.invoices) ? invoices.invoices : [];
    if (list.length > 0) return { demoInvoiceId: list[0]?.id ?? null };

    const providers = await fetchJson(`${baseUrl}/api/evergreen/acquisitions?action=providers`, { jar });
    const vendors = Array.isArray(providers?.vendors) ? providers.vendors : [];
    const providerId = vendors[0]?.id ?? null;
    if (!providerId) return { demoInvoiceId: null };

    const methods = await fetchJson(`${baseUrl}/api/evergreen/acquisitions?action=invoice_methods`, { jar });
    const recvMethod = Array.isArray(methods?.methods) && methods.methods[0]?.code ? String(methods.methods[0].code) : "";
    if (!recvMethod) return { demoInvoiceId: null };

    const created = await fetchJson(`${baseUrl}/api/evergreen/acquisitions`, {
      method: "POST",
      jar,
      csrfToken,
      json: {
        action: "create_invoice",
        providerId,
        receiver: orgId,
        recvMethod,
        invIdent: `STACKSOS-DEMO-${Date.now()}`,
        note: "Seeded by StacksOS demo data",
      },
    });

    const demoInvoiceId = created?.invoiceId ?? null;
    console.log("[seed] created acquisitions invoice");
    return { demoInvoiceId };
  } catch (e) {
    console.warn(`[seed] acquisitions invoice seed skipped: ${String(e).slice(0, 160)}`);
    return { demoInvoiceId: null };
  }
}

async function ensureBooking({ baseUrl, jar, csrfToken, orgId, demoPatronBarcode, demoItemBarcode }) {
  try {
    const seeded = await fetchJson(`${baseUrl}/api/evergreen/booking`, {
      method: "POST",
      jar,
      csrfToken,
      json: { action: "seed_demo_resource", ownerId: orgId, copyBarcode: demoItemBarcode || null },
    });

    const resourceId = seeded?.resourceId ?? null;
    const now = Date.now();
    const start = new Date(now + 60 * 60 * 1000);
    const end = new Date(now + 2 * 60 * 60 * 1000);

    if (resourceId) {
      try {
        await fetchJson(`${baseUrl}/api/evergreen/booking`, {
          method: "POST",
          jar,
          csrfToken,
          json: {
            action: "create",
            patron_barcode: demoPatronBarcode,
            resource_id: resourceId,
            start_time: start.toISOString(),
            end_time: end.toISOString(),
            pickup_lib: orgId,
          },
        });
      } catch (e) {
        console.warn(`[seed] booking reservation skipped: ${String(e).slice(0, 160)}`);
      }
    }

    return {
      bookingResourceTypeId: seeded?.resourceTypeId ?? null,
      bookingResourceId: resourceId,
    };
  } catch (e) {
    console.warn(`[seed] booking seed skipped: ${String(e).slice(0, 160)}`);
    return { bookingResourceTypeId: null, bookingResourceId: null };
  }
}

async function ensureAuthority({ baseUrl, jar, csrfToken }) {
  try {
    const existing = await fetchJson(`${baseUrl}/api/evergreen/authority?q=smith&limit=1`, { jar });
    if (Array.isArray(existing?.authorities) && existing.authorities.length > 0) {
      return { seeded: false };
    }

    const seeded = await fetchJson(`${baseUrl}/api/evergreen/authority`, {
      method: "POST",
      jar,
      csrfToken,
      json: { action: "seed", headings: ["Smith"] },
    });
    void seeded;
    console.log("[seed] created authority record(s)");
    return { seeded: true };
  } catch (e) {
    console.warn(`[seed] authority seed skipped: ${String(e).slice(0, 160)}`);
    return { seeded: false };
  }
}

async function lookupPatronId({ baseUrl, jar, barcode }) {
  try {
    const res = await fetchJson(`${baseUrl}/api/evergreen/patrons?barcode=${encodeURIComponent(barcode)}`, { jar });
    return res?.patron?.id ?? null;
  } catch {
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Circulation Activity Seeding                                               */
/* -------------------------------------------------------------------------- */

const CHECKOUT_PLAN = [
  { patronIdx: 1,  items: [{ copyIdx: 0,  dueDays: 14 }, { copyIdx: 1,  dueDays: 7  }, { copyIdx: 2,  dueDays: -5  }] },
  { patronIdx: 2,  items: [{ copyIdx: 3,  dueDays: 10 }, { copyIdx: 4,  dueDays: 3  }] },
  { patronIdx: 3,  items: [{ copyIdx: 5,  dueDays: 14 }, { copyIdx: 6,  dueDays: -8 }, { copyIdx: 7,  dueDays: 21 }] },
  { patronIdx: 4,  items: [{ copyIdx: 8,  dueDays: 7  }, { copyIdx: 9,  dueDays: -3 }] },
  { patronIdx: 5,  items: [{ copyIdx: 10, dueDays: 14 }, { copyIdx: 11, dueDays: 10 }] },
  { patronIdx: 6,  items: [{ copyIdx: 12, dueDays: 21 }, { copyIdx: 13, dueDays: -12}, { copyIdx: 14, dueDays: 5  }] },
  { patronIdx: 7,  items: [{ copyIdx: 15, dueDays: 14 }, { copyIdx: 16, dueDays: 7  }] },
  { patronIdx: 8,  items: [{ copyIdx: 17, dueDays: 10 }, { copyIdx: 18, dueDays: -2 }] },
  { patronIdx: 9,  items: [{ copyIdx: 19, dueDays: 14 }, { copyIdx: 20, dueDays: 7  }, { copyIdx: 21, dueDays: 3  }] },
  { patronIdx: 10, items: [{ copyIdx: 22, dueDays: 14 }, { copyIdx: 23, dueDays: -6 }] },
  { patronIdx: 11, items: [{ copyIdx: 24, dueDays: 10 }, { copyIdx: 25, dueDays: 7  }] },
  { patronIdx: 12, items: [{ copyIdx: 26, dueDays: 21 }, { copyIdx: 27, dueDays: -10}, { copyIdx: 28, dueDays: 14 }] },
  { patronIdx: 13, items: [{ copyIdx: 29, dueDays: 7  }, { copyIdx: 30, dueDays: 3  }] },
  { patronIdx: 14, items: [{ copyIdx: 31, dueDays: 14 }, { copyIdx: 32, dueDays: -4 }] },
  { patronIdx: 15, items: [{ copyIdx: 33, dueDays: 10 }, { copyIdx: 34, dueDays: 7  }] },
  { patronIdx: 16, items: [{ copyIdx: 35, dueDays: 14 }, { copyIdx: 36, dueDays: 7  }, { copyIdx: 37, dueDays: -7 }] },
  { patronIdx: 17, items: [{ copyIdx: 38, dueDays: 14 }, { copyIdx: 39, dueDays: -1 }] },
  { patronIdx: 18, items: [{ copyIdx: 40, dueDays: 21 }, { copyIdx: 41, dueDays: 10 }] },
];

const CHECKIN_PLAN = [
  { patronIdx: 19, copyIndices: [80, 81] },
  { patronIdx: 20, copyIndices: [82, 83] },
  { patronIdx: 21, copyIndices: [84, 85] },
  { patronIdx: 22, copyIndices: [86, 87] },
  { patronIdx: 23, copyIndices: [88] },
];

const HOLD_PLAN = [
  { patronIdx: 0,  bibOffset: 0  },
  { patronIdx: 3,  bibOffset: 1  },
  { patronIdx: 5,  bibOffset: 2  },
  { patronIdx: 7,  bibOffset: 3  },
  { patronIdx: 9,  bibOffset: 5  },
  { patronIdx: 11, bibOffset: 7  },
  { patronIdx: 13, bibOffset: 10 },
  { patronIdx: 15, bibOffset: 12 },
  { patronIdx: 17, bibOffset: 15 },
  { patronIdx: 2,  bibOffset: 17 },
  { patronIdx: 4,  bibOffset: 19 },
  { patronIdx: 6,  bibOffset: 20 },
  { patronIdx: 8,  bibOffset: 50 },
  { patronIdx: 10, bibOffset: 51 },
  { patronIdx: 12, bibOffset: 52 },
  { patronIdx: 14, bibOffset: 53 },
  { patronIdx: 16, bibOffset: 54 },
  { patronIdx: 18, bibOffset: 55 },
];

async function resolveBibIdsFromItems({ baseUrl, jar, bibCount, copiesPerBib }) {
  console.log("[seed] resolving bib IDs from existing items...");
  const bibIds = [];

  // We only need offsets used by HOLD_PLAN: 0-20 and 50-55.
  // Look up the first copy barcode for each bib to find its record ID.
  const neededOffsets = new Set(HOLD_PLAN.map((h) => h.bibOffset));
  const maxOffset = Math.max(...neededOffsets) + 1;
  const limit = Math.min(bibCount, maxOffset);

  for (let bibOffset = 0; bibOffset < limit; bibOffset++) {
    if (!neededOffsets.has(bibOffset)) {
      bibIds.push(null);
      continue;
    }
    const copyIdx = bibOffset * copiesPerBib;
    const barcode = String(39000001000000n + BigInt(copyIdx));
    try {
      const resp = await fetchJson(
        `${baseUrl}/api/evergreen/items?barcode=${encodeURIComponent(barcode)}`,
        { jar }
      );
      // The API returns { item: { recordId, ... } }
      const bibId = resp?.item?.recordId ?? resp?.item?.record_id ?? resp?.item?.bibId ?? null;
      bibIds.push(bibId);
      if (bibId) {
        console.log(`[seed] bib offset ${bibOffset}: barcode ${barcode} → record ${bibId}`);
      }
    } catch (e) {
      console.warn(`[seed] bib lookup failed for offset ${bibOffset} (${barcode}): ${String(e).slice(0, 120)}`);
      bibIds.push(null);
    }
  }

  const resolved = bibIds.filter(Boolean).length;
  console.log(`[seed] resolved ${resolved} bib IDs from ${limit} item lookups`);
  return bibIds;
}

async function seedCirculationActivity({ baseUrl, jar, csrfToken, orgId, patronMap, bibIds }) {
  const summary = {
    checkoutsAttempted: 0,
    checkoutsSucceeded: 0,
    checkinsAttempted: 0,
    checkinsSucceeded: 0,
    holdsAttempted: 0,
    holdsSucceeded: 0,
    overdueCount: 0,
    errors: [],
  };

  if (process.env.DEMO_SKIP_CIRC_ACTIVITY === "1") {
    console.log("[seed] skipping circulation activity (DEMO_SKIP_CIRC_ACTIVITY=1)");
    return summary;
  }

  if (patronMap.size === 0) {
    console.warn("[seed] skipping circulation activity: no patron IDs available");
    return summary;
  }

  function copyBarcode(index) {
    return String(39000001000000n + BigInt(index));
  }

  function pBarcode(idx) {
    if (idx === 0) return process.env.DEMO_PATRON_BARCODE || "29000000001234";
    return String(29000000010000 + idx).padStart(14, "0");
  }

  function formatDateOffset(days) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split("T")[0];
  }

  // Phase 1: Active checkouts (some with past due dates = overdue)
  console.log("[seed] circulation phase 1: creating checkouts...");
  for (const entry of CHECKOUT_PLAN) {
    const patronBc = pBarcode(entry.patronIdx);
    if (!patronMap.has(patronBc)) continue;
    for (const item of entry.items) {
      try {
        summary.checkoutsAttempted++;
        await fetchJson(`${baseUrl}/api/evergreen/circulation`, {
          method: "POST",
          jar,
          csrfToken,
          json: {
            action: "checkout",
            patronBarcode: patronBc,
            itemBarcode: copyBarcode(item.copyIdx),
            dueDate: formatDateOffset(item.dueDays),
          },
        });
        summary.checkoutsSucceeded++;
        if (item.dueDays < 0) summary.overdueCount++;
        await sleep(200);
      } catch (e) {
        const errStr = String(e);
        if (errStr.includes("OPEN_CIRCULATION_EXISTS") || errStr.includes("409")) {
          summary.checkoutsSucceeded++;
          if (item.dueDays < 0) summary.overdueCount++;
        } else {
          summary.errors.push(`checkout ${patronBc}/${copyBarcode(item.copyIdx)}: ${errStr.slice(0, 160)}`);
          console.warn(`[seed] checkout failed: ${errStr.slice(0, 160)}`);
        }
      }
    }
  }
  console.log(`[seed] checkouts: ${summary.checkoutsSucceeded}/${summary.checkoutsAttempted} (${summary.overdueCount} overdue)`);

  // Phase 2: Today's checkins (checkout then immediately return)
  console.log("[seed] circulation phase 2: creating today's checkins...");
  for (const entry of CHECKIN_PLAN) {
    const patronBc = pBarcode(entry.patronIdx);
    if (!patronMap.has(patronBc)) continue;
    for (const idx of entry.copyIndices) {
      try {
        // Checkout first
        summary.checkoutsAttempted++;
        await fetchJson(`${baseUrl}/api/evergreen/circulation`, {
          method: "POST",
          jar,
          csrfToken,
          json: {
            action: "checkout",
            patronBarcode: patronBc,
            itemBarcode: copyBarcode(idx),
          },
        });
        summary.checkoutsSucceeded++;
        await sleep(200);

        // Then checkin
        summary.checkinsAttempted++;
        await fetchJson(`${baseUrl}/api/evergreen/circulation`, {
          method: "POST",
          jar,
          csrfToken,
          json: {
            action: "checkin",
            itemBarcode: copyBarcode(idx),
          },
        });
        summary.checkinsSucceeded++;
        await sleep(200);
      } catch (e) {
        const errStr = String(e);
        summary.errors.push(`checkin-roundtrip ${patronBc}/${copyBarcode(idx)}: ${errStr.slice(0, 160)}`);
        console.warn(`[seed] checkin roundtrip failed: ${errStr.slice(0, 160)}`);
      }
    }
  }
  console.log(`[seed] checkins: ${summary.checkinsSucceeded}/${summary.checkinsAttempted}`);

  // Phase 3: Holds (title-level)
  // Use the dedicated holds endpoint so this does not consume circulation route limits.
  console.log("[seed] circulation phase 3: placing holds...");
  for (const entry of HOLD_PLAN) {
    const patronBc = pBarcode(entry.patronIdx);
    const patronId = patronMap.get(patronBc);
    if (!patronId) {
      console.warn(`[seed] hold skipped: no ID for patron ${patronBc}`);
      continue;
    }
    const bibId = bibIds[entry.bibOffset];
    if (!bibId) {
      console.warn(`[seed] hold skipped: no bib at offset ${entry.bibOffset}`);
      continue;
    }

    try {
      summary.holdsAttempted++;
      await fetchJson(`${baseUrl}/api/evergreen/holds`, {
        method: "POST",
        jar,
        csrfToken,
        json: {
          action: "create",
          patronId,
          targetId: bibId,
          pickupLib: orgId,
          holdType: "T",
        },
      });
      summary.holdsSucceeded++;
      await sleep(200);
    } catch (e) {
      const errStr = String(e);
      if (errStr.includes("HOLD_EXISTS") || errStr.includes("hold already")) {
        summary.holdsSucceeded++;
      } else {
        summary.errors.push(`hold patron=${patronBc} bib=${bibId}: ${errStr.slice(0, 160)}`);
        console.warn(`[seed] hold failed: ${errStr.slice(0, 160)}`);
      }
    }
  }
  console.log(`[seed] holds: ${summary.holdsSucceeded}/${summary.holdsAttempted}`);

  console.log(
    `[seed] circulation activity complete: ${summary.checkoutsSucceeded} checkouts, ` +
    `${summary.checkinsSucceeded} checkins, ${summary.holdsSucceeded} holds, ` +
    `${summary.overdueCount} overdue, ${summary.errors.length} errors`
  );

  return summary;
}

async function main() {
  loadEnv();

  const baseUrl = (process.env.STACKSOS_BASE_URL || "http://localhost:3000").replace(/\/+$/, "");
  const staffUsername =
    process.env.SEED_STAFF_USERNAME ||
    process.env.STACKSOS_AUDIT_STAFF_USERNAME ||
    process.env.E2E_STAFF_USER ||
    "";
  const staffPassword =
    process.env.SEED_STAFF_PASSWORD ||
    process.env.STACKSOS_AUDIT_STAFF_PASSWORD ||
    process.env.E2E_STAFF_PASS ||
    "";
  const workstation = process.env.SEED_WORKSTATION || "STACKSOS-SEED";
  const forceRecreate = process.env.SEED_FORCE_RECREATE === "1";

  if (!staffUsername || !staffPassword) {
    throw new Error(
      "Missing staff credentials. Set SEED_STAFF_USERNAME/SEED_STAFF_PASSWORD (or STACKSOS_AUDIT_STAFF_* / E2E_STAFF_*)."
    );
  }

  const jar = new CookieJar();
  const csrf = await fetchJson(`${baseUrl}/api/csrf-token`, { jar });
  const csrfToken = csrf?.token;
  if (!csrfToken) throw new Error("Failed to fetch CSRF token");

  await fetchJson(`${baseUrl}/api/evergreen/auth`, {
    method: "POST",
    jar,
    csrfToken,
    json: { username: staffUsername, password: staffPassword, workstation },
  });

  const session = await fetchJson(`${baseUrl}/api/evergreen/auth`, { jar });
  if (!session?.authenticated) throw new Error("Failed to authenticate (session not authenticated)");

  const actor = session.user || {};
  const actorId = typeof actor.id === "number" ? actor.id : 2;
  const orgId = Number(actor.ws_ou ?? actor.home_ou ?? 1) || 1;

  console.log(`[seed] baseUrl=${baseUrl}`);
  console.log(`[seed] actor=${actorId} orgId=${orgId}`);

  await ensureWorkstation({ baseUrl, jar, csrfToken, orgId, workstation });

  const demoPatronPin = process.env.DEMO_PATRON_PIN || "DEMO1234";
  const demoPatronBarcode = process.env.DEMO_PATRON_BARCODE || "29000000001234";
  const patronMap = new Map();
  const primaryResult = await ensurePatron({
    baseUrl,
    jar,
    csrfToken,
    orgId,
    barcode: demoPatronBarcode,
    username: "stacksos.demo.patron",
    firstName: "StacksOS",
    lastName: "DemoPatron",
    pin: demoPatronPin,
  });
  if (primaryResult.id) {
    patronMap.set(demoPatronBarcode, primaryResult.id);
  } else {
    const fallbackId = await lookupPatronId({ baseUrl, jar, barcode: demoPatronBarcode });
    if (fallbackId) patronMap.set(demoPatronBarcode, fallbackId);
  }

  const patronCount = Number(process.env.DEMO_PATRON_COUNT || 10);
  for (let i = 1; i <= patronCount; i++) {
    const patron = DEMO_PATRONS[i - 1] || { first: "Demo", last: `Patron${i}` };
    const barcode = String(29000000010000 + i).padStart(14, "0");
    const username = `${patron.first.toLowerCase()}.${patron.last.toLowerCase().replace(/[^a-z]/g, "")}`;
    const result = await ensurePatron({
      baseUrl,
      jar,
      csrfToken,
      orgId,
      barcode,
      username,
      firstName: patron.first,
      lastName: patron.last,
      pin: demoPatronPin,
    });
    if (result.id) {
      patronMap.set(barcode, result.id);
    } else {
      const fallbackId = await lookupPatronId({ baseUrl, jar, barcode });
      if (fallbackId) patronMap.set(barcode, fallbackId);
    }
  }
  console.log(`[seed] patron map: ${patronMap.size} patrons with IDs`);

  const catalog = await ensureCatalogSeed({ baseUrl, jar, csrfToken, orgId, forceRecreate });

  await ensureCalendarVersion({ baseUrl, jar, csrfToken, orgId });
  await ensureOrgSetting({ baseUrl, jar, csrfToken, orgId });

  const circMod = await ensureCircModifier({ baseUrl, jar, csrfToken });
  const template = await ensureCopyTemplate({ baseUrl, jar, csrfToken, orgId, circModifierCode: circMod.code });

  await ensureBucket({
    baseUrl,
    jar,
    csrfToken,
    recordId: catalog.createdBibIds[0] ?? null,
  });

  const statCats = await ensureStatCategories({ baseUrl, jar, csrfToken, orgId });
  const courseReserves = await ensureCourseReserves({ baseUrl, jar, csrfToken, orgId });
  const scheduled = await ensureScheduledReports({ baseUrl, jar, csrfToken, orgId });
  const invoice = await ensureAcqInvoice({ baseUrl, jar, csrfToken, orgId });
  const booking = await ensureBooking({ baseUrl, jar, csrfToken, orgId, demoPatronBarcode, demoItemBarcode: catalog.firstCopyBarcode });
  await ensureCopyTags({ baseUrl, jar, csrfToken, orgId });
  await ensureAuthority({ baseUrl, jar, csrfToken });

  let bibIdsForCirc = catalog.createdBibIds;
  if (bibIdsForCirc.length === 0) {
    const bibCount = Number(process.env.DEMO_BIB_COUNT || 100);
    const copiesPerBib = Number(process.env.DEMO_COPIES_PER_BIB || 2);
    bibIdsForCirc = await resolveBibIdsFromItems({ baseUrl, jar, bibCount, copiesPerBib });
  }

  const circActivity = await seedCirculationActivity({
    baseUrl,
    jar,
    csrfToken,
    orgId,
    patronMap,
    bibIds: bibIdsForCirc,
  });

  const out = {
    generatedAt: isoNow(),
    baseUrl,
    orgId,
    actorId,
    demoPatronBarcode,
    demoPatronPin,
    demoItemBarcode: catalog.firstCopyBarcode,
    workstation,
    bibsCreated: catalog.createdBibIds.length,
    copiesCreated: catalog.copiesCreated,
    circModifierCode: circMod.code,
    copyTemplateId: template.id ?? null,
    demoCopyStatCatId: statCats.demoCopyStatCatId,
    demoPatronStatCatId: statCats.demoPatronStatCatId,
    demoCourseId: courseReserves.demoCourseId,
    demoTermId: courseReserves.demoTermId,
    demoScheduleId: scheduled.demoScheduleId,
    demoInvoiceId: invoice.demoInvoiceId,
    bookingResourceTypeId: booking.bookingResourceTypeId,
    bookingResourceId: booking.bookingResourceId,
    circulationActivity: {
      seededAt: isoNow(),
      checkoutsCreated: circActivity.checkoutsSucceeded,
      checkinsCreated: circActivity.checkinsSucceeded,
      holdsCreated: circActivity.holdsSucceeded,
      overdueItems: circActivity.overdueCount,
      errors: circActivity.errors.length,
    },
  };

  const outPath = path.join(__dirname, "..", "audit", "demo_data.json");
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf8");
  console.log(`[seed] wrote ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
