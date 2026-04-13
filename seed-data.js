const PAGE_SEED = [];

/* Helper for Wikidot/SCP style Clinical Output */
function createAnomaly(itemNum, className, desc, proc, sym='') {
  return `
<div class="wiki-box">
  <div class="wiki-meta">
    Item #: ${itemNum}<br>
    Threat Level: <span style="text-transform:uppercase;color:var(--red-b)">${className}</span><br>
    Clearance: Level 4 Required
  </div>
  <h2 class="wiki-h">Containment Procedures</h2>
  <p>${proc}</p>
  <h2 class="wiki-h">Description</h2>
  <p>${desc}</p>
  ${sym ? `<h2 class="wiki-h">Addendum / Symbiotics</h2><p>${sym}</p>` : ''}
</div>
`;
}

function createArchon(name, born, tenure, desc) {
  return `
<div class="wiki-box">
  <div class="wiki-meta">
    <strong>Subject:</strong> ${name}<br>
    <strong>Born:</strong> ${born}<br>
    <strong>Tenure (Archon):</strong> ${tenure}
  </div>
  <h2 class="wiki-h">Historical Profile</h2>
  <p>${desc}</p>
</div>
`;
}

function createClass(name, summary, desc) {
  return `
<div class="wiki-box">
  <div class="wiki-meta">
    <strong>Classification:</strong> ${name}<br>
    <strong>Summary:</strong> ${summary}
  </div>
  <h2 class="wiki-h">Protocol Details</h2>
  <p>${desc}</p>
</div>
`;
}

function createMRD(name, summary, desc) {
  return `
<div class="wiki-box">
  <div class="wiki-meta">
    <strong>Detachment:</strong> ${name}<br>
    <strong>Operational Focus:</strong> ${summary}
  </div>
  <h2 class="wiki-h">Unit Mandate</h2>
  <p>${desc}</p>
</div>
`;
}

function createGuideDoc() {
  return `
<div class="page-shell">
  <header class="page-header">
    <h1 class="page-title">Orientation Directive 001</h1>
    <p class="page-subtitle">Guild Lore, Operations, and Classification Standard</p>
  </header>

  <section class="page-section guide-section">
    <h2>Introduction</h2>
    <p>Welcome to the Red Oaker Guild. This guide is the working manual for personnel entering the archive, the registry, or the response chain. It summarizes the doctrine that binds the Guild together, the history that shaped it, and the current structure used in live operations.</p>
    <p>The Red Oaker Guild exists to document, contain, and when necessary execute. ROSED governs that order. Shelter first. Execution only when no viable containment path remains.</p>
  </section>

  <section class="page-section guide-section">
    <h2>ROSED Doctrine</h2>
    <p>ROSED stands for Red Oaker Shelter and Execution Department. It is the Guild's operational philosophy and its command identity. The Shelter mandate prioritizes containment, classification, and study. The Execution mandate authorizes final action against anomalies that cannot be stabilized without unacceptable loss of life or reality integrity.</p>
    <p>ROSED is not a contradiction. It is a sequence: preserve what can be preserved, destroy what cannot be allowed to spread.</p>
  </section>

  <section class="page-section guide-section">
    <h2>Archon Era Timeline</h2>
    <p><strong>Hoffman Era:</strong> The founding period. Dr. Mateo Hoffman established the study-first archive structure and the first stable taxonomy for anomalies.</p>
    <p><strong>Schroeder Era:</strong> The control period. Dr. Hans Schroeder militarized the Guild, intensified capture doctrine, and formed early MRD units.</p>
    <p><strong>Sidorov Era:</strong> The structural period. Dr. Praskovya Sidorov formalized the classification system and built the global containment framework.</p>
    <p><strong>Instability Period:</strong> Following Sidorov's disappearance, the Guild fractured. The primary site was sealed and archives suffered catastrophic losses.</p>
    <p><strong>Ekat Era:</strong> Mikolov "Ekat" Gunitsky rebuilt the Guild through surveillance, hard protocol, and severe internal control.</p>
    <p><strong>Windsor Era:</strong> Charolette Windsor pushed coexistence and mitigation, especially in ecological containment.</p>
    <p><strong>Government Interim:</strong> Distributed authority slowed operations and proved inefficient for rapid anomaly response.</p>
    <p><strong>Quincy Era:</strong> Javier Quincy restored centralized command autonomy, modernized the response structure, and expanded MRD independence.</p>
  </section>

  <section class="page-section guide-section">
    <h2>Threat Class Framework</h2>
    <p>The live class model used by the Guild is operational, not cosmetic. Alona marks stable low-risk anomalies. Delphi marks manageable but active risk. Soros marks dangerous entities requiring dedicated response. Vega marks catastrophic regional threat. Apophis marks owner-level override authority. Erebus marks terminal, world-ending risk with no reliable containment path.</p>
  </section>

  <section class="page-section guide-section">
    <h2>Clearance Ladder</h2>
    <p>Level 2 is the minimum authenticated access tier. Level 4 is reserved for moderators. Level 5 is reserved for admins. Level 6 is reserved for the Owner. No Level 1 or Level 3 access is currently active in the live deployment.</p>
  </section>

  <section class="page-section guide-section">
    <h2>Militarized Response Detachments</h2>
    <p><strong>Prometheus</strong> handles direct containment. <strong>Osiris</strong> and <strong>Osiris-A1</strong> enforce internal protocol and black-level fail-safes. <strong>Galen</strong> and <strong>Galen A1</strong> counter digital, memetic, and cognitohazard threats. <strong>Artemis</strong> handles biological hazards. <strong>Thales</strong> handles animalistic anomalies. <strong>Vanir</strong>, <strong>Ares</strong>, <strong>Ivar</strong>, and <strong>Apate</strong> cover recovery, rapid response, large-scale anomalies, and secrecy operations.</p>
  </section>

  <section class="page-section guide-section">
    <h2>Submission Taxonomy</h2>
    <p>Anomaly submissions must begin with an established designation family and exact code. The current live families are ROS, SLOA, SOA, SCTOR, and TL. Tales and artworks may reference an anomaly designation to link back to a primary case file.</p>
  </section>
</div>`;
}


// --- DOCTRINE ---
PAGE_SEED.push({
  title: 'Orientation Directive 001', slug: 'guide', type: 'Guide', tags: ['guide', 'lore'],
  htmlContent: createGuideDoc(),
  cssContent: ''
});

// --- DOCTRINE ---
PAGE_SEED.push({
  title: 'Doctrine: ROSED', slug: 'doctrine-rosed', type: 'Lore (Doctrine)', tags: ['lore', 'command'],
  htmlContent: createClass('ROSED', 'Red Oaker Shelter and Execution Department', 'The central command authority of the Red Oaker Guild. Operating under a strict dual-mandate: Shelter first, Execution/Kill if necessary. ROSED dictates that containment and study are the primary objectives for any anomaly, but authorizes immediate, absolute lethal force if an entity poses an uncontainable existential threat.')
});

PAGE_SEED.push({
  title: 'Hostile Faction: Order of the Ten Truths (OTT)',
  slug: 'order-of-ten-truths',
  type: 'Lore (Threat Faction)',
  tags: ['lore', 'faction', 'threat', 'cult'],
  htmlContent: `
<div class="page-shell">
  <header class="page-header">
    <h1 class="page-title">Order of the Ten Truths (OTT)</h1>
    <p class="page-subtitle">Threat Faction Dossier // Level 4 Access</p>
  </header>

  <section class="page-section">
    <h2>Summary</h2>
    <p>Order of the Ten Truths (OTT) is a hostile, cult-like organization that worships anomalies as divine beings and seeks their release from Guild containment. The Order operates under a doctrine known as the Ten Truths, of which only five are confirmed to ARROG while the remaining doctrines remain intentionally concealed.</p>
    <p>Members exhibit extreme devotion, often engaging in sacrificial actions and violent operations against Guild personnel, viewing containment as blasphemy and liberation as a sacred duty.</p>
  </section>

  <section class="page-section">
    <h2>Confirmed Truths (5/10)</h2>
    <h3>Truth I</h3>
    <blockquote><p>Anomalies are not oddities, they are perfect gods amongst human filth.</p></blockquote>

    <h3>Truth II</h3>
    <blockquote><p>Those who wish to imprison them will be met with suffering and loss.</p></blockquote>

    <h3>Truth III</h3>
    <blockquote><p>Without the anomalies, life itself is nothing but rotten suffering.</p></blockquote>

    <h3>Truth IV</h3>
    <blockquote><p>Blasphemy against the anomalies is to be met with death.</p></blockquote>

    <h3>Truth V</h3>
    <blockquote><p>We serve as a sacrifice and guides to the gods that have allowed themselves to be among us.</p></blockquote>
  </section>
</div>`
});

// --- ARCHONS ---
PAGE_SEED.push({
  title: 'Archon: Dr. Mateo Hoffman', slug: 'archon-mateo-hoffman', type: 'Lore (Archon)', tags: ['archon', 'lore'],
  htmlContent: createArchon('Dr. Mateo Hoffman', 'Jan 6, 1852', 'Mar 8, 1890 – Oct 16, 1942', 'The Founder of the modern collective. Dr. Hoffman viewed anomalous entities not strictly as threats to be destroyed, but as wonders of an interconnected universe. His foundational texts laid the groundwork for the modern categorizations we use today, setting a precedent of study over blind incineration.')
});
PAGE_SEED.push({
  title: 'Archon: Dr. Hans Schroeder', slug: 'archon-hans-schroeder', type: 'Lore (Archon)', tags: ['archon', 'lore'],
  htmlContent: createArchon('Dr. Hans Schroeder', 'Aug 25, 1890', 'Oct 20, 1942 – Oct 20, 1972', 'The Architect of Control. Evolving the collective into the militarized Red Oaker Guild. He shifted the paradigm heavily toward capture, experimentation, and weaponization of anomalies. Under his tenure, the earliest iterations of the MRD were founded.')
});
PAGE_SEED.push({
  title: 'Archon: Dr. Praskovya Sidorov', slug: 'archon-praskovya-sidorov', type: 'Lore (Archon)', tags: ['archon', 'lore'],
  htmlContent: createArchon('Dr. Praskovya Sidorov', 'May 5, 1940', 'Nov 5, 1972 – May 6, 1986', 'The Visionary of Structure. Dr. Sidorov recognized that Schroeder’s brute-force methods were unsustainable. She formalized the threat classification system, introducing the "Soros" classification, and established global containment infrastructures.')
});
PAGE_SEED.push({
  title: 'Historical Event: The Instability Period', slug: 'event-instability-period', type: 'Lore (Timeline)', tags: ['event', 'lore'],
  htmlContent: `<div class="wiki-box"><h2 class="wiki-h">1986–1989 Instability Period</h2><p>Following the sudden disappearance of Dr. Sidorov, the Guild entered a period of extreme factionalism. No clear Archon could be appointed. The Primary Site was sealed due to internal conflicts, leading to widespread anomaly escapes and catastrophic data loss across regional servers.</p></div>`
});
PAGE_SEED.push({
  title: 'Archon: Mikolov "Ekat" Gunitsky', slug: 'archon-ekat-gunitsky', type: 'Lore (Archon)', tags: ['archon', 'lore'],
  htmlContent: createArchon('Mikolov "Ekat" Gunitsky', 'Sept 10, 1942', 'Nov 23, 1989 – Dec 19, 2005', 'The Rebuilder. Seizing control after the Instability Period, Ekat ruled with an iron fist. He established extreme heavy surveillance over the staff and draconian measures for containment breaches. His paranoid protocols saved the Guild from collapse, though employee defection rates were at an all-time high.')
});
PAGE_SEED.push({
  title: 'Archon: Charolette Windsor', slug: 'archon-charolette-windsor', type: 'Lore (Archon)', tags: ['archon', 'lore'],
  htmlContent: createArchon('Charolette Windsor', 'Jan 1, 1952', 'Jan 9, 2006 – Dec 21, 2012', 'The Refined Leader. Windsor shifted the Guild back toward a philosophy of coexistence, focusing heavily on mitigating human impact while preserving anomalous ecosystems. She was responsible for officially codifying the "Vega" classification after the 2008 breach event.')
});
PAGE_SEED.push({
  title: 'Historical Event: Government Interim', slug: 'event-government-interim', type: 'Lore (Timeline)', tags: ['event', 'lore'],
  htmlContent: `<div class="wiki-box"><h2 class="wiki-h">2012–2015 Government Interim</h2><p>A forced restructuring period where no single Archon was permitted power. A collective authority, heavily influenced by global governmental overwatch, ran day-to-day operations. It proved devastatingly inefficient for rapid anomaly response.</p></div>`
});
PAGE_SEED.push({
  title: 'Archon: Javier Quincy', slug: 'archon-javier-quincy', type: 'Lore (Archon)', tags: ['archon', 'lore'],
  htmlContent: createArchon('Javier Quincy', 'Nov 8, 1980', 'April 6, 2015 – Present', 'The Modern Stabilizer. A distinctly private operations powerhouse. Quincy maneuvered the Guild away from federal oversight, reinstating autocratic Guild control while fiercely protecting his staff. Under Quincy, MRD units operate with unprecedented autonomy.')
});

// --- CLASSIFICATIONS ---
PAGE_SEED.push({
  title: 'Threat Class: Alona', slug: 'class-alona', type: 'Lore (Class)', tags: ['classification', 'threat-level'],
  htmlContent: createClass('Alona', 'Minimal threat. Safe, passive, or beneficial.', 'Anomalies classified as Alona require minimal security protocols. They are structurally understood, do not possess inherently hostile intent, or their anomalous properties are reliably isolated and mitigated without active suppression. Some Alona objects are permitted to be handled by Level 2 personnel.')
});
PAGE_SEED.push({
  title: 'Threat Class: Delphi', slug: 'class-delphi', type: 'Lore (Class)', tags: ['classification', 'threat-level'],
  htmlContent: createClass('Delphi', 'Low to moderate threat. Manageable/predictable.', 'Delphi classifications apply to entities or items whose anomalous properties are understood but still require active containment protocols to prevent psychological or physical harm. They are predictable, but mismanagement can lead to localized casualties.')
});
PAGE_SEED.push({
  title: 'Threat Class: Soros', slug: 'class-soros', type: 'Lore (Class)', tags: ['classification', 'threat-level'],
  htmlContent: createClass('Soros', 'High threat. Dangerous and highly unstable.', 'Soros categorizes anomalies that actively resist containment or present an immediate, localized lethal threat to personnel or civilians. They require specialized MRD units for suppression and constant surveillance. Containment breaches involving Soros-class entities usually prompt immediate lockdown protocols.')
});
PAGE_SEED.push({
  title: 'Threat Class: Vega', slug: 'class-vega', type: 'Lore (Class)', tags: ['classification', 'threat-level'],
  htmlContent: createClass('Vega', 'Catastrophic threat. Large-scale destruction but mitigatable.', 'Vega class anomalies pose a risk to massive geographic regions bordering on global catastrophe. While incredibly destructive, the Guild possesses actionable protocols capable of mitigating their effects or forcing them into temporary dormancy.')
});
PAGE_SEED.push({
  title: 'Threat Class: Erebus', slug: 'class-erebus', type: 'Lore (Class)', tags: ['classification', 'threat-level'],
  htmlContent: createClass('Erebus', 'World-Ending. Existential, uncontainable.', 'An Erebus classification designates an anomaly for which the Red Oaker Guild has zero functional containment strategies. Activation or escape of an Erebus entity designates an immediate IK-Class End-of-the-World scenario. Protocols dictate observational monitoring only.')
});

// --- CLEARANCE LEVELS ---
const clearances = [
  ['Level 1', 'Public-facing or unregistered access. No write privileges.'],
  ['Level 2', 'Regular personnel. Restricted access to Alona and Delphi materials.'],
  ['Level 4', 'Moderators and containment specialists. Granted Soros access for review and enforcement.'],
  ['Level 5', 'Administrators. Executive board authority and publication control.'],
  ['Level 6', 'Owners. Absolute override status across the Guild.']
];
clearances.forEach( c => {
  PAGE_SEED.push({
    title: `Clearance: ${c[0]}`, slug: `clearance-${c[0].toLowerCase().replace(' ','-')}`, type: 'Lore (Clearance)', tags: ['clearance', 'personnel'],
    htmlContent: createClass(c[0], 'Personnel Access Protocol', c[1])
  });
});

// --- MRD UNITS ---
PAGE_SEED.push({
  title: 'MRD: Apate', slug: 'mrd-apate', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Apate', 'Secrecy, public control, memory erasure.', 'Apate operates almost exclusively outside of Guild black-sites. They are deployed post-incident to restructure public timelines, execute mass amnestication, and manufacture cover stories to ensure civilian ignorance of anomalous activity.')
});
PAGE_SEED.push({
  title: 'MRD: Feldgendarmerie', slug: 'mrd-feldgendarmerie', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Feldgendarmerie', 'Disbanded military police.', 'A historical attachment formerly operating under Dr. Schroeder. Known for brutal suppression of staff descent and violent anomaly extraction. Officially disbanded in 1972 after a mass revolt.')
});
PAGE_SEED.push({
  title: 'MRD: Vanir', slug: 'mrd-vanir', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Vanir', 'Expedition and acquisition.', 'The Guilds primary scouting and artifact recovery unit. Vanir is optimized for prolonged survival in hostile or dimensionally unstable environments, tasked with bringing uncontained objects into Guild custody.')
});
PAGE_SEED.push({
  title: 'MRD: Artemis', slug: 'mrd-artemis', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Artemis', 'Biological/chemical containment.', 'A heavily armored detachment specializing in bio-hazards, infectious anomalous pathogens, and rapidly mutating flora/fauna. Members are permanently housed in sanitized atmospheric suits.')
});
PAGE_SEED.push({
  title: 'MRD: Osiris', slug: 'mrd-osiris', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Osiris', 'Internal security, protocol enforcement.', 'The internal policing force of the Red Oaker Guild. Osiris ensures researchers do not break testing protocols and handles internal containment breaches or seditious behavior.')
});
PAGE_SEED.push({
  title: 'MRD: Prometheus', slug: 'mrd-prometheus', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Prometheus', 'Main containment force, direct interaction.', 'The backbone of the Guilds militarized response. Prometheus acts as the sledgehammer against actively hostile Soros-class entities resisting containment.')
});
PAGE_SEED.push({
  title: 'MRD: Ivar', slug: 'mrd-ivar', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Ivar', 'Large-scale/environmental anomalies.', 'Specialists in managing massive spatial anomalies, localized reality-warping zones, and entities too large to physically move. Often deployed with heavy industrial pacification equipment.')
});
PAGE_SEED.push({
  title: 'MRD: Osiris-A1', slug: 'mrd-osiris-a1', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Osiris-A1', 'Black-protocol failsafe.', 'A shadow cell existing alongside Osiris. Their unilateral directive is the termination of compromised entire Sites or Guild sectors. They eliminate threats, including other Guild staff, at all costs to protect the macro-structure.')
});
PAGE_SEED.push({
  title: 'MRD: Thales', slug: 'mrd-thales', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Thales', 'Animalistic anomalies (behavioral analysis).', 'Operators trained in zoology, crypto-behaviorism, and non-verbal pacification. Used specifically to wrangle and herd instinct-driven entities like ROS-0010 and ROS-0012 without resorting to lethal force.')
});
PAGE_SEED.push({
  title: 'MRD: Galen', slug: 'mrd-galen', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Galen', 'Digital/signal/memetic anomalies.', 'Cyber-warfare and ontological tracking unit. They combat entities that exist as data, rogue broadcasting signals, and conceptual digital threats.')
});
PAGE_SEED.push({
  title: 'MRD: Galen A1', slug: 'mrd-galen-a1', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Galen A1', 'Memetic and psychological threats.', 'An offshoot of Galen dealing with cognitohazards. Members undergo rigorous neural-suppression treatments allowing them to perceive sanity-destroying imagery or paradoxes without succumbing to madness.')
});
PAGE_SEED.push({
  title: 'MRD: Ares', slug: 'mrd-ares', type: 'Lore (MRD)', tags: ['mrd', 'military'],
  htmlContent: createMRD('Ares', 'Rapid-response unit.', 'Fast-drop shock troopers. Ares is mobilized via supersonic transport to lockdown sudden breaches globally within a 45-minute window until heavier units like Prometheus arrive.')
});

// --- ANOMALIES ---
PAGE_SEED.push({
  title: 'ROS-0001: The Hollow Man', slug: 'ros-0001', type: 'Anomaly', tags: ['humanoid', 'soros'],
  htmlContent: createAnomaly('ROS-0001', 'Soros', 
    'ROS-0001 is a humanoid entity lacking discernible epidermal features. Scans indicate its internal organs have been entirely replaced by a highly volatile corrosive sludge. When the entity perceives emotional or physical distress in local subjects, the sludge pressure builds, forcing it to violently vent the acid through pores in its skin, dissolving biological matter within a 15-meter radius.',
    'Entity is to be contained within a highly pressurized, alkaline-lined cell. Surveillance cameras must be devoid of audio input to prevent remote sympathetic activation. Guards are to display zero outward emotion while on rotation.')
});
PAGE_SEED.push({
  title: 'ROS-0002: The Life Recorder', slug: 'ros-0002', type: 'Anomaly', tags: ['entity', 'soros', 'cognitohazard'],
  htmlContent: createAnomaly('ROS-0002', 'Soros', 
    'A spectral, fog-shrouded entity linked directly to SLO-000A (The Indescribable Camera). It exists out-of-phase with localized reality, appearing only as a silhouette in the mist. Observing the entity for longer than 120 seconds induces catastrophic cognitive collapse, as victims attempt to verbally describe geometry that human vocal cords cannot produce. Causes terminal madness.',
    'Visual observation of ROS-0002 is strictly prohibited. Sensors within the containment zone must rely on thermal and barometric disruption to track its movements.',
    'Symbiotic attachment to SLO-000A. If the camera is moved, the entity shifts its containment space.')
});
PAGE_SEED.push({
  title: 'ROS-0003: The All-Seeing Dog', slug: 'ros-0003', type: 'Anomaly', tags: ['animal', 'delphi'],
  htmlContent: createAnomaly('ROS-0003', 'Delphi', 
    'ROS-0003 appears phenotypically identical to an overly massive St. Bernard dog. The entity generates a psychic dampening field causing extreme emotional dependency in human subjects within 30 meters. Prolonged exposure causes reality to distort; rooms shrink, walls warp to keep subjects closer to the entity, preventing them from leaving its presence.',
    'Staff interaction limited to automated feeding systems. Rotation of biological cleanup crew must not exceed 10 minutes. Thales MRD units equipped with psychic dampeners handle transport.')
});
PAGE_SEED.push({
  title: 'ROS-0004: Moon Fish', slug: 'ros-0004', type: 'Anomaly', tags: ['animal', 'soros', 'hallucinogen'],
  htmlContent: createAnomaly('ROS-0004', 'Soros', 
    'An ancient, black Betta fish housed in a standard (though anomalous) glass bowl. Observing the fish swimming causes intense auditory and visual hallucinations in the observer, universally manifesting as the sensation of being trapped at the bottom of an abyssal trench. Victims hold their breath until asphyxiation or suffer panic-induced cardiac arrest.',
    'The bowl is kept within an opaque, lead-lined vault. Cameras inside the vault must be heavily distorted artificially to prevent the cognitohazard from affecting surveillance teams.')
});
PAGE_SEED.push({
  title: 'ROS-0005: Wax Man', slug: 'ros-0005', type: 'Anomaly', tags: ['humanoid'],
  htmlContent: createAnomaly('ROS-0005', 'Alona (Neutralized)', 
    'Formerly a humanoid entity composed entirely of congealed blood and commercial candle wax. It required ambient temperatures of approximately 45°C to maintain mobility. Due to a containment failure involving a breached HVAC unit in 1993, the entity underwent a rapid thermodynamic shift, completely melting into an inert puddle. It has been classified as deceased.',
    'The remains are sealed in a cryogenic bio-drum. No further interactions are recorded.')
});
PAGE_SEED.push({
  title: 'ROS-0006: Red Ring Vector', slug: 'ros-0006', type: 'Anomaly', tags: ['animal', 'biohazard', 'soros'],
  htmlContent: createAnomaly('ROS-0006', 'Soros', 
    'A flying insect specimen carrying a virus-toxin hybrid that causes neurological collapse in victims, followed by aggressive reanimation after death. Both the vector insect and the infected subjects harbor a severe photophobia, experiencing extreme repulsion and disorientation in bright light.',
    'To be stored in a hermetically sealed, independently ventilated biocontainment unit. The entire containment sector must be fitted with redundant high-intensity illumination systems as the primary method of control during a breach.')
});
PAGE_SEED.push({
  title: 'ROS-0007: Dishonest Abe', slug: 'ros-0007', type: 'Anomaly', tags: ['entity', 'reality-warping', 'vega'],
  htmlContent: createAnomaly('ROS-0007', 'Vega', 
    'An entity whose spoken words actively distort perception and, when enough listeners are present, temporarily rewrite localized reality itself. During active speaking events, it can cause total sensory confusion, non-permanent fatalities, and catastrophic containment disasters. All physical damage reverts once the effect concludes.',
    'Total auditory isolation required. Automated systems only. Human personnel must wear rated acoustic dampeners when within 100 meters of the containment suite. No verbal interaction permitted.')
});
PAGE_SEED.push({
  title: 'ROS-0008: The Colonel and His Men', slug: 'ros-0008', type: 'Anomaly', tags: ['humanoid', 'group', 'delphi'],
  htmlContent: createAnomaly('ROS-0008', 'Delphi', 
    'A cohesive group of four tactically trained military figures originating from an alternate reality. They retain full awareness of their confinement and lack of place in this universe. They remain organized under their original command structure and view Guild personnel and the outside world with high suspicion, though they have not acted overtly hostile without provocation.',
    'Housed in a standard multi-occupant tactical barracks. Interactions are to be strictly handled via official diplomatic liaisons. Unscheduled entry into their barracks is prohibited to prevent defensive retaliation.')
});
PAGE_SEED.push({
  title: 'ROS-0010: Scolopendra hyper gigantea', slug: 'ros-0010', type: 'Anomaly', tags: ['animal', 'vega'],
  htmlContent: createAnomaly('ROS-0010', 'Vega', 
    'An abnormally massive, heavily armored specimen of the Scolopendra genus (centipedes), measuring 45 meters in length. Its carapace is resistant to standard ballistics. Curiously, the entity behaves much like a domesticated canine when fed large quantities of raw meat; however, if allowed to experience starvation for longer than 36 hours, it becomes an apex predator capable of burrowing through reinforced concrete.',
    'Housed in Sector D Subterranean Habitat. To be fed 400kg of biological matter twice daily. Thales units are required on standby during shedding cycles.')
});
PAGE_SEED.push({
  title: 'ROS-0012: Vampiric Tiger', slug: 'ros-0012', type: 'Anomaly', tags: ['animal', 'soros'],
  htmlContent: createAnomaly('ROS-0012', 'Soros', 
    'A massive Siberian tiger featuring elongated, blood-red canines protruding downwards. Its fur possesses a meta-optical property rendering it completely invisible in any ambient light level below 15 lumens. It does not eat meat, instead relying entirely on draining the bio-electrical/hemoglobin energy of living prey via its bite.',
    'Containment pen must be illuminated with multi-spectrum floodlights emitting no less than 50,000 lumens at all times. Backup generators mandated.')
});
PAGE_SEED.push({
  title: 'SLAO-0001: The Hollow Man\'s Cane', slug: 'slao-0001', type: 'Anomaly', tags: ['object', 'symbiotic'],
  htmlContent: createAnomaly('SLAO-0001', 'Delphi', 
    'An ornate walking cane intricately carved from dark, unidentified bone. It operates in a symbiotic relationship with ROS-0001. If physically separated from ROS-0001 by more than 50 meters, the cane telekinetically attempts to suffocate any human within 5 meters by rapidly pulling the air from their lungs.',
    'Always to be stored within 10 meters of ROS-0001\'s containment cell. Do not grasp handle with bare skin.')
});
PAGE_SEED.push({
  title: 'SLO-000A: Indescribable Camera', slug: 'slo-000a', type: 'Anomaly', tags: ['object', 'cognitohazard'],
  htmlContent: createAnomaly('SLO-000A', 'Soros', 
    'An archaic camera model whose visual geometry defies human comprehension. Observers cannot accurately describe the camera\'s shape without experiencing severe migraines. Prolonged proximity causes an intense obsession with "discovering the truth," compelling users to seek out ROS-0002 to use the camera.',
    'Stored securely in an opaque box inside Galen A1\'s localized cognitohazard vault. Linked to ROS-0002.')
});
PAGE_SEED.push({
  title: 'SOA-0001: The Tailor\'s Scissors', slug: 'soa-0001', type: 'Anomaly', tags: ['object', 'lethal'],
  htmlContent: createAnomaly('SOA-0001', 'Delphi', 
    'A pair of vintage wrought-iron tailor scissors. Capable of cutting through any known material flawlessly with zero resistance. However, it imposes an extreme binding rule on the user. If the user cuts an object out of anger or without precise measurements, the scissors teleport instantaneously, inflicting a mirrored, lethal cut upon the user\'s own body.',
    'Approved only for automated robotic usage during extreme extraction scenarios. Never to be wielded manually by personnel.')
});
PAGE_SEED.push({
  title: 'SOA-0002: Unstable Radio', slug: 'soa-0002', type: 'Anomaly', tags: ['object', 'audio'],
  htmlContent: createAnomaly('SOA-0002', 'Soros', 
    'A 1960s wooden transistor radio that cannot be powered down. It constantly broadcasts highly warped, unidentifiable musical frequencies. Subjects listening to the transmission for more than 4 minutes report severe psychosis, bleeding from the auditory meatus, and violent paroxysms.',
    'Suspended in a vacuum-sealed anechoic chamber. Audio feeds for monitoring are heavily quantized to destroy the anomalous frequency peaks.')
});
PAGE_SEED.push({
  title: 'SOA-0003: Door to Infinity', slug: 'soa-0003', type: 'Anomaly', tags: ['object', 'vega', 'spatial'],
  htmlContent: createAnomaly('SOA-0003', 'Vega', 
    'A freestanding wooden door frame. Opening the door reveals a non-finite spatial continuum filled with chaotic, shifting geometries. Passing through the door is non-fatal, but keeping the door open alters Earth\'s localized global reality unpredictably, rewriting historical events or altering physical laws while active.',
    'Door must remain locked with a temporal-stabilized deadbolt. The entire room is sealed in poured concrete. No testing permitted.')
});
PAGE_SEED.push({
  title: 'SOA-0004: Hanging Lights', slug: 'soa-0004', type: 'Anomaly', tags: ['object', 'soros'],
  htmlContent: createAnomaly('SOA-0004', 'Soros', 
    'A string of decorative, multihued patio lights. Unplugging them is impossible as the cord lacks an end. If the lights are switched to the "strobe" or "fade" setting, any human in visual range experiences catastrophic systemic nerve pain, rapidly elevating until cardiac arrest forces death in under two minutes.',
    'Locked permanently on the "solid" state. Secure within a windowless concrete bunker.')
});
