import crypto from "node:crypto";

export const MATT_COMPATIBILITY = Object.freeze({
  matrixVersion: "0.1.4",
  release: "v1.2.3",
  commit: "6acc160e4e0cd062dbbbd7a1b26ae92855edf07e",
  archive: "https://github.com/mattpocock/skills/archive/6acc160e4e0cd062dbbbd7a1b26ae92855edf07e.tar.gz",
  skillsCli: "skills@1.5.22"
});

export const MATT_ROLES = Object.freeze({
  automatic: Object.freeze([
    "grilling", "domain-modeling", "research", "prototype", "codebase-design",
    "tdd", "diagnosing-bugs", "code-review", "wizard", "writing-for-agents"
  ]),
  handoff: Object.freeze([
    "setup-matt-pocock-skills", "improve-codebase-architecture", "wayfinder", "handoff", "to-questionnaire"
  ]),
  standalone: Object.freeze([
    "ask-matt", "grill-with-docs", "triage", "to-spec", "to-tickets", "grill-me", "teach", "wait-what"
  ]),
  incompatible: Object.freeze(["implement", "resolving-merge-conflicts"])
});

export const MATT_AUTOMATIC_SKILLS = MATT_ROLES.automatic;
export const MATT_INSTALLABLE_SKILLS = Object.freeze([
  ...MATT_ROLES.automatic,
  ...MATT_ROLES.handoff,
  ...MATT_ROLES.standalone
]);
export const MATT_OFFICIAL_SKILLS = Object.freeze(Object.values(MATT_ROLES).flat());
// Content identities produced by skills@1.5.22 --copy from the exact v1.2.3 archive.
// They let init classify existing project files before any target mutation without
// bundling or redistributing Matt's Skill contents.
export const MATT_CONTENT_HASHES = Object.freeze({
  "grilling": "f6b0b6a07f6f51a7b39dfed4c737bd5990149e6ac227265dc457eb962e40fde6",
  "domain-modeling": "8d774870ffd93ad77b07f56bbe59fb76c8f9e246fe49e0181ed65a519fc28929",
  "research": "3bbc342f7484484d31118fd7cb148690aba2600b318d6b680edc6ce2c2399948",
  "prototype": "08f5e9d003dfcbc274f4a31864c9fcbc2962ad8574f40e7bba7d78193f5d349f",
  "codebase-design": "0050828acbec9af9711ac1376749acaf358fb1bbfd98c80fc20df7a26658ccd7",
  "tdd": "775d2b0eb45fdf7a102f0ec0cfca8448c5d441c49373e0a89bc7a22dbe892c3c",
  "diagnosing-bugs": "9fc5749a1671a7c894cc538fbbedda19890bd20f297eb6095ba0969a933ed2dc",
  "code-review": "e4c202dae670331dab5aef98a05594a45ec3b8210a8f9c2ab8a8bba848da4c8e",
  "wizard": "991cb02af3f4584b07f5b6ce30176d05bf2622152a8776db9832825f80601e3d",
  "writing-for-agents": "f58ac3a5e4034da89bd31ff86ffdc74df9e986ef818055d9a399f05fc3b37a1b",
  "setup-matt-pocock-skills": "cb2d75f72fb70ba283a5d76f2722d090a00cb4d3e227e32b05a547193e561800",
  "improve-codebase-architecture": "986e4245d52053692fc866c4c3065a3b944fc2f27a1ea99785a2b116d785e964",
  "wayfinder": "a99de1eab6ae2950b5d4146abfd58257a3e0cfdcbd5e9611f27b2a485fd52242",
  "handoff": "9f8a832aafee3eec6dae6902d758b2438fefb116a6afb9914777238538b14d2b",
  "to-questionnaire": "9a27c55ce8d45b8a7f1a7309bece202bebcd7cab359f551aeeeb3d5c320a3b55",
  "ask-matt": "55c6191c39ad1727d8285225db5a97e622026f6c861f1c924dbc92d8c433e344",
  "grill-with-docs": "05c1b216a482ea0fd5a5281e96b0f1b5fd5e1c1e9edd572709c71944ef6fd7d6",
  "triage": "7009d742e1cf0e40b0d8de8fc47ece25161795da595bd7017a170426dbb51d9a",
  "to-spec": "969b7955a044939809487b416d1e907021c6ad4b07bd5979f46e2f1c629ffd01",
  "to-tickets": "b7c6499e10c567abdbfca7f5c730f2de91584a517816ace5aaaff49f4790e947",
  "grill-me": "cec05582f13830a7bd63984474b999c806a7b93935ed638a27f32eac1b7f976b",
  "teach": "209d2ead53b2c6eba2425198f6f09eb51fd2bde490c34da2d93b187b4b749414",
  "wait-what": "345b8e9aba9f134944f37ae7807cadd19c1b6866d77e3414f2e8f3835061aac0",
  "implement": "3180dbe245245f99dceb669e597cf633935cc87be0ca3c39a86dde54e62a4db9",
  "resolving-merge-conflicts": "cf66bf26fb8a943d426271120f033825f7ed591349812ff4f636d3db56c976dc"
});
export const MATT_CATALOG_DIGEST = crypto.createHash("sha256").update(JSON.stringify({
  compatibility: MATT_COMPATIBILITY,
  roles: MATT_ROLES,
  installableSkills: MATT_INSTALLABLE_SKILLS,
  contentHashes: MATT_CONTENT_HASHES
})).digest("hex");
