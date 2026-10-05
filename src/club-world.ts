import { leagueStructureForSeason, type Division, type LeagueStructure } from "./league-structure.js";
import { SeededRandom } from "./random.js";
import type { SeasonId } from "./rules.js";

export interface WorldClub {
  id: string;
  name: string;
  division: Division;
}

/** Fixed identities: an id always belongs to the same invented-place name. */
export const HOME_COUNTRY_CLUBS = [
  "Aldermere Town", "Amberleigh City", "Applecombe United", "Ardenwick Rovers",
  "Barrowfen Athletic", "Bellcaster Wanderers", "Birchmarsh County", "Blackmere Albion",
  "Bramberley", "Briarford Town", "Brindlehurst City", "Brookstanton United",
  "Caldermere Rovers", "Carrowby Athletic", "Chalkminster Wanderers", "Cliffendale County",
  "Copperleigh Albion", "Cressmere Haven", "Crowminster Town", "Dalechester City",
  "Darnwick United", "Deercombe Rovers", "Dunleigh Athletic", "Elderhurst Wanderers",
  "Elmswick County", "Emberford Albion", "Fairmarsh", "Falconleigh Town",
  "Fallowcaster City", "Ferncombe United", "Flintmere Rovers", "Foxminster Athletic",
  "Glenstanton Wanderers", "Goldwick County", "Greyhaven Albion", "Hadleyfen",
  "Harrowmere Town", "Hazelchester City", "Heatherby United", "Highmarsh Rovers",
  "Hollingmere Athletic", "Kestrelford Wanderers", "Kingshollow County", "Lakewick Albion",
  "Lindenhurst", "Littlecaster Town", "Longmere City", "Maplecombe United",
  "Marlden Rovers", "Merrywick Athletic", "Millcaster Wanderers", "Mossleigh County",
  "Nettleford Albion", "Newmarsh", "Norchester Town", "Oakenmere City",
  "Otterwick United", "Pinecombe Rovers", "Plumcaster Athletic", "Quarrycombe Wanderers",
  "Ravenmere County", "Reedchester Albion", "Ridgewick", "Rosemarsh Town",
  "Rowanford City", "Rushleigh United", "Silvercombe Rovers", "Skylarkmere Athletic",
  "Slatewick Wanderers", "Southcaster County", "Sparrowhurst Albion", "Springmarsh",
  "Stagmere Town", "Starlingford City", "Summerwick United", "Tansycombe Rovers",
  "Thistlecaster Athletic", "Triemere Wanderers", "Valeford County", "Watermere Albion",
  "Westercroft", "Whitecaster Town", "Willowcombe City", "Winderleigh Vale United",
  "Winterwick Rovers", "Woodlark Athletic", "Wrenchester Wanderers", "Yarrowmere County",
  "Yewcombe Albion", "Alderfen", "Brackenmere Town", "Cloverwick City",
] as const satisfies readonly string[];

const CLUB_WORDS = new Set([
  "albion", "athletic", "city", "county", "rovers", "town", "united", "wanderers",
]);

/** The geographic identity of a club, with a conventional final club word removed. */
export function clubPlacePart(name: string): string {
  const words = name.trim().split(/\s+/);
  if (CLUB_WORDS.has(words.at(-1)!.toLocaleLowerCase("en-GB"))) words.pop();
  return words.join(" ");
}

function assertUniquePool(pool: readonly string[]): void {
  const names = new Set<string>();
  for (const name of pool) {
    const normalized = name.toLocaleLowerCase("en-GB");
    if (names.has(normalized)) throw new Error(`Duplicate club name: ${name}`);
    names.add(normalized);
  }
}

export function homeCountryClubsForSeason(
  season: SeasonId,
  seed: number,
  structures?: readonly LeagueStructure[],
  pool: readonly string[] = HOME_COUNTRY_CLUBS,
): WorldClub[] {
  const structure = structures === undefined
    ? leagueStructureForSeason(season)
    : leagueStructureForSeason(season, structures);
  const divisions = [1, 2, 3, 4] as const;
  const total = divisions.reduce((sum, division) => sum + structure.divisionSizes[division], 0);
  if (pool.length < total) throw new Error(`Club pool has ${pool.length} names; ${total} required`);
  assertUniquePool(pool);

  const selected = Array.from({ length: total }, (_, index) => index);
  const random = new SeededRandom(seed);
  for (let index = selected.length - 1; index > 0; index -= 1) {
    const target = Math.floor(random.next() * (index + 1));
    [selected[index], selected[target]] = [selected[target]!, selected[index]!];
  }

  const divisionByPoolIndex = new Map<number, Division>();
  let offset = 0;
  for (const division of divisions) {
    const end = offset + structure.divisionSizes[division];
    for (const poolIndex of selected.slice(offset, end)) divisionByPoolIndex.set(poolIndex, division);
    offset = end;
  }

  return selected.slice().sort((a, b) => a - b).map((poolIndex) => ({
    id: `home-club-${poolIndex + 1}`,
    name: pool[poolIndex]!,
    division: divisionByPoolIndex.get(poolIndex)!,
  }));
}
