const CATEGORY_RULES = [
  ["Faith", ["faith", "believe", "believing", "trust god", "defenders of faith"]],
  ["Prayer", ["prayer", "pray", "intercession", "intercede", "11 hours"]],
  ["Holy Spirit", ["holy spirit", "holy ghost", "spirit", "anointing", "glory meeting"]],
  ["Healing", ["healing", "heal", "health", "sickness"]],
  ["Miracles", ["miracle", "miracles", "signs", "wonders", "supernatural"]],
  ["Prophecy", ["prophet", "prophetic", "school of the prophet", "visions"]],
  ["Breakthrough", ["breakthrough", "deliverance", "liberated", "set free"]],
  ["Mercy", ["mercy", "mercies", "messengers of mercy"]],
  ["Grace", ["grace", "graces", "gift of grace"]],
  ["Love of God", ["love of god", "father", "good good father", "beloved"]],
  ["Righteousness", ["righteous", "righteousness", "justification"]],
  ["Salvation", ["salvation", "saved", "born again", "sin", "sins power"]],
  ["Kingdom", ["kingdom", "reign", "dominion", "authority"]],
  ["Wisdom", ["wisdom", "understanding", "discernment"]],
  ["Purpose", ["purpose", "calling", "destiny", "vision"]],
  ["Leadership", ["leadership", "leader", "ministry", "service"]],
  ["Finances", ["money", "finance", "finances", "prosperity", "wealth"]],
  ["Marriage", ["marriage", "relationship", "relationships", "family"]],
  ["Worship", ["worship", "songs", "sounds", "music"]],
  ["Bible Study", ["bible", "scripture", "romans", "galatians", "corinth", "pauline theology"]],
  ["Sonship", ["sonship", "son consciousness", "sons of god"]],
  ["Eternal Life", ["eternal life", "immortality", "heaven", "hell", "death"]],
  ["Apologetics", ["apologetics", "defenders", "questions of the faith", "defense"]],
  ["Conferences", ["conference", "conferences", "dead raisers conferences"]],
];

export function categoriesForTrack(track) {
  const text = normalizeCategory(
    [track.title, track.caption, track.fileName, track.postedAt, track.messageId].join(" ")
  );

  return CATEGORY_RULES.filter(([, terms]) =>
    terms.some((term) => text.includes(normalizeCategory(term)))
  ).map(([name]) => name);
}

export function buildCategoryCounts(tracks) {
  const counts = new Map(CATEGORY_RULES.map(([name]) => [name, 0]));
  for (const track of tracks) {
    for (const topic of track.topics || []) {
      if (counts.has(topic)) counts.set(topic, counts.get(topic) + 1);
    }
  }

  return CATEGORY_RULES.map(([name]) => ({ name, count: counts.get(name) || 0 })).filter(
    (topic) => topic.count > 0
  );
}

export function normalizeCategory(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
