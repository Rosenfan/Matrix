import crypto from "node:crypto";

export const MATT_COMPATIBILITY = Object.freeze({
  matrixVersion: "0.1.7",
  release: "v1.3.1",
  commit: "24fe0ef7737efae15c87225755e9f6f5965e4888",
  archive: "https://github.com/mattpocock/skills/archive/24fe0ef7737efae15c87225755e9f6f5965e4888.tar.gz",
  skillsCli: "skills@1.7.4"
});

export const MATT_ROLES = Object.freeze({
  automatic: Object.freeze([
    "grilling", "domain-modeling", "research", "prototype", "codebase-design",
    "tdd", "diagnosing-bugs", "code-review", "wizard", "writing-for-agents"
  ]),
  handoff: Object.freeze([
    "setup-matt-pocock-skills", "improve-codebase-architecture", "wayfinder", "handoff", "to-questionnaire", "retro"
  ]),
  standalone: Object.freeze([
    "ask-matt", "grill-with-docs", "triage", "to-spec", "to-tickets", "grill-me", "teach", "wait-what", "pr"
  ]),
  incompatible: Object.freeze(["implement", "implement-spec"])
});

export const MATT_AUTOMATIC_SKILLS = MATT_ROLES.automatic;
export const MATT_INSTALLABLE_SKILLS = Object.freeze([
  ...MATT_ROLES.automatic,
  ...MATT_ROLES.handoff,
  ...MATT_ROLES.standalone
]);
export const MATT_OFFICIAL_SKILLS = Object.freeze(Object.values(MATT_ROLES).flat());
// Content identities produced by skills@1.7.4 --copy from the exact v1.3.1 archive.
// They let init classify existing project files before any target mutation without
// bundling or redistributing Matt's Skill contents.
export const MATT_CONTENT_HASHES = Object.freeze({
  "grilling": "229e9190ddcdf65fcfa68aeebe6edfcf3b039967e4d5321c48325ea197836b88",
  "domain-modeling": "332c4e23360e692a488fa25fe878596f91e4eaf125f48ea280dca151f3798eaa",
  "research": "8766e592808cb8e6951dd8e4d414f4fef3ee9dde1c487b2e5af7461027f794e2",
  "prototype": "5fc3162feb286bc773e21c208c440de81f66ef36e6ae2fd2189a54756af4468c",
  "codebase-design": "17a6a1ab67eff070a38564834d6e3ff82bc2d46cdc888a57f6bc18c3efe6442b",
  "tdd": "cf0a63fd20988baef0a31d2d8467e70319fdc75d5bb3eaa60620abcedb97574c",
  "diagnosing-bugs": "bc1ade4a8b7e988aed02c251d3d0d8cdbedc74ce3361a244e2cf12cbb6744d74",
  "code-review": "9a883c4392f27b6d45c6a51d12d168897ba7707a5e70f8d45a042b41db58d5a5",
  "wizard": "b2793f1654b9c518eb85386cc51f9218030c6dc83772bea3c128cb156c972300",
  "writing-for-agents": "46d0c6f716d2c4cbb27ea157fd3e18675389fecf3d722343f05c82b7c1e61bf8",
  "setup-matt-pocock-skills": "7fd2c1e02b10bdd59f2c15a7cbc364e247286884c1c5cdd21704f7cbc769b42a",
  "improve-codebase-architecture": "4502270f003e0702f19da6c2436daffe0f9d4dafcea3de2759347b99c5a5c404",
  "wayfinder": "a774efe838aede8db313dbf3cd16660075803b3ed3657d3297ec913ea67fad49",
  "handoff": "5aff146205749c5daab83c1f0299b910a1caaa403bcd37f59f35513a6c13dc12",
  "to-questionnaire": "51d0425a65248e2d5ca1b4d06e4f854cb131e49a43326f54a81690ce28e27535",
  "retro": "e7b2f28bf8e88e539791db6f9ec566252b56afc179d5b881486340a477ec59bd",
  "ask-matt": "b1cf1467569d4199e6cec74a3fa9036d42bb208e76084e5d5030e23cd7f1f1dc",
  "grill-with-docs": "bbf60554b6f102ed734211b26c5d3cc237be19e0dd5d93c1a8dea1367d6ebc23",
  "triage": "f44745c02d710fee1bd12e036f8a4d53a4615018c255dd90dba7ec09a23ebb6d",
  "to-spec": "23e7133ad3781b22ddc23335c88a975b71ebc809a7b5f734b158bb05abaaa5e8",
  "to-tickets": "b7296c8466d53eb832047afad28932db82b1f31da4b647ec0c63a5af824a8bbc",
  "grill-me": "b37db6d78417792b8dd9a478bc8fcdf7a008dcb94cb172247b01fda6205ba6e3",
  "teach": "78966fd2b3ab60f3c08c25660d7a237325c1a243a9ba1103e7dc77edf9713825",
  "wait-what": "ea4bde2069b457b52a0b2ba39bfc686a54fff73b79c91ef974224d0215298a9f",
  "pr": "4f2bdb1aaf75c6cd0f4696889ff1022cff86ab81c3c1e3a1ba4ce00964d98146",
  "implement": "3180dbe245245f99dceb669e597cf633935cc87be0ca3c39a86dde54e62a4db9",
  "implement-spec": "9f2d9a27a67a0edee8bcc1c12c5dae69ea77ffaf2a4898a939c6afd0c7db7f47"
});
export const MATT_CATALOG_DIGEST = crypto.createHash("sha256").update(JSON.stringify({
  compatibility: MATT_COMPATIBILITY,
  roles: MATT_ROLES,
  installableSkills: MATT_INSTALLABLE_SKILLS,
  contentHashes: MATT_CONTENT_HASHES
})).digest("hex");
