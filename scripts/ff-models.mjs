/**
 * Faraday Future's FF / FX robot models, from FF's rate card
 * (RoboShare_Price_List_1008). Shared by add-ff-models.mjs and
 * curate-listable-models.mjs so a curate run never delists them.
 */
// slug, brand, model, capabilityTag, msrp, day, month, useCase[], listable
export const FF_MODELS = [
  ["ff-master", "FF", "Master", "humanoid", 37000, 1099, 6599, ["Performance", "Guide"], true],
  ["ff-master-ultra", "FF", "Master Ultra", "humanoid", 64990, 1699, 10199, ["Performance", "Guide"], true],
  ["ff-all-new-futurist", "FF", "All-New Futurist", "humanoid", 89900, 2499, 14999, ["Performance", "Guide"], true],
  // Not launched yet; its rental prices are provisional, so it stays off the catalog.
  ["ff-master-mini", "FF", "Master Mini", "humanoid", 9990, 299, 1799, ["Performance", "Guide"], false],
  ["fx-aegis-pro", "FX", "Aegis Pro", "quadruped", 4490, 279, 739, ["Patrol", "Performance"], true],
  ["fx-aegis-edu", "FX", "Aegis Edu", "quadruped", 9990, 329, 1109, ["Patrol", "Performance"], true],
  ["fx-navi", "FX", "Navi", "quadruped", 1990, 109, 289, ["Patrol", "Performance"], true],
];
