"use strict";
(function () {
  const manifest = window.DICTIONARY_MANIFEST;
  const $ = (id) => document.getElementById(id);
  const query = $("query");
  const status = $("status");
  const result = $("result");
  const suggestions = $("suggestions");
  const aboutDialog = $("aboutDialog");
  const aboutOpen = $("aboutOpen");
  const aboutClose = $("aboutClose");
  const loaded = new Map();
  let locale = manifest?.defaultLocale || "de-CH";
  let currentEntry = null;
  let currentMatched = "";
  const sectionOptions = [
    { section: "sectionGrammar", control: "showGrammar", label: "Grammatik" },
    { section: "sectionForms", control: "showForms", label: "Wortformen" },
    { section: "sectionHyphenation", control: "showHyphenation", label: "Worttrennung" },
    { section: "sectionMeanings", control: "showMeanings", label: "Bedeutungen" },
    { section: "sectionSynonyms", control: "showSynonyms", label: "Synonyme" },
    { section: "sectionOrigins", control: "showOrigins", label: "Herkunft" },
    { section: "sectionExamples", control: "showExamples", label: "Beispiele" },
    { section: "sectionIdioms", control: "showIdioms", label: "Redewendungen" },
    { section: "sectionCollocations", control: "showCollocations", label: "Charakteristische Wortkombinationen" },
    { section: "sectionDerivations", control: "showDerivations", label: "Wortbildungen" },
  ];
  const visibleSections = Object.fromEntries(sectionOptions.map((option) => [option.section, true]));

  try {
    const savedLocale = localStorage.getItem("barrierefreies-woerterbuch-locale");
    if (manifest?.locales?.includes(savedLocale)) locale = savedLocale;
  } catch (_) {
    // Das Wörterbuch funktioniert auch, wenn der Browser lokale Einstellungen sperrt.
  }
  try {
    const savedSections = JSON.parse(localStorage.getItem("barrierefreies-woerterbuch-rubriken") || "{}");
    for (const option of sectionOptions) {
      if (typeof savedSections[option.section] === "boolean") {
        visibleSections[option.section] = savedSections[option.section];
      }
    }
  } catch (_) {
    // Ungültige oder gesperrte lokale Einstellungen werden durch Standardwerte ersetzt.
  }

  const normalize = (value) => (value || "")
    .trim()
    .toLocaleLowerCase("de")
    .normalize("NFC")
    .replace(/ß/g, "ss");

  const localized = (value) => {
    if (typeof value !== "string") return value;
    return locale === "de-CH" ? value.replace(/ß/g, "ss").replace(/ẞ/g, "SS") : value;
  };

  const prefix = (value, count) => {
    const chars = Array.from(normalize(value)).slice(0, count);
    while (chars.length < count) chars.push("\0");
    return chars
      .map((char) => char.codePointAt(0).toString(16).padStart(4, "0"))
      .join("-");
  };

  if (!manifest) {
    status.textContent = "Fehler: Das lokale Wörterbuchverzeichnis konnte nicht geladen werden.";
    query.disabled = true;
    return;
  }

  const available = {
    search: new Set(manifest.searchShards),
    entries: new Set(manifest.entryShards),
    suggest: new Set(manifest.suggestionShards),
  };

  function loadScript(kind, shard) {
    const key = `${kind}:${shard}`;
    if (loaded.has(key)) return loaded.get(key);
    if (!available[kind].has(shard)) return Promise.resolve(false);
    const promise = new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = `data-v5/${kind}/${shard}.js`;
      script.onload = () => resolve(true);
      script.onerror = () => reject(new Error(`Datendatei ${shard} konnte nicht geladen werden.`));
      document.head.append(script);
    });
    loaded.set(key, promise);
    return promise;
  }

  function distance(a, b) {
    a = normalize(a);
    b = normalize(b);
    let previous = Array.from({ length: b.length + 1 }, (_, index) => index);
    for (let i = 1; i <= a.length; i += 1) {
      const current = [i];
      for (let j = 1; j <= b.length; j += 1) {
        current[j] = Math.min(
          current[j - 1] + 1,
          previous[j] + 1,
          previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
        );
      }
      previous = current;
    }
    return previous[b.length];
  }

  function clear() {
    result.hidden = true;
    suggestions.hidden = true;
    $("suggestionList").replaceChildren();
  }

  function setBusy(busy) {
    query.disabled = busy;
    $("searchButton").disabled = busy;
    document.body.setAttribute("aria-busy", String(busy));
  }

  function addDefinition(term, value) {
    if (!value) return;
    const dt = document.createElement("dt");
    const dd = document.createElement("dd");
    dt.textContent = term;
    dd.textContent = localized(value);
    $("grammar").append(dt, dd);
  }

  function fillList(id, values, empty) {
    const element = $(id);
    element.replaceChildren();
    for (const value of values.length ? values : [empty]) {
      const li = document.createElement("li");
      li.textContent = localized(value);
      element.append(li);
    }
  }

  function fillExamples(entry) {
    const list = $("examples");
    list.replaceChildren();
    const values = entry.examples || [];
    if (!values.length) {
      const li = document.createElement("li");
      li.textContent = "Keine Beispiele angegeben.";
      list.append(li);
      return;
    }
    for (const example of values) {
      const li = document.createElement("li");
      const text = document.createElement("q");
      text.textContent = localized(example.text);
      li.append(text);
      if (example.reference) {
        const reference = document.createElement("span");
        reference.textContent = ` Quelle: ${localized(example.reference)}`;
        li.append(reference);
      }
      list.append(li);
    }
  }

  function applySectionVisibility() {
    for (const option of sectionOptions) {
      $(option.section).hidden = !visibleSections[option.section];
      $(option.control).checked = visibleSections[option.section];
    }
  }

  function saveSectionVisibility() {
    try {
      localStorage.setItem("barrierefreies-woerterbuch-rubriken", JSON.stringify(visibleSections));
    } catch (_) {
      // Die Auswahl gilt mindestens bis zum Schliessen dieser Seite.
    }
  }

  function sourceUrl(source, entry) {
    if (source.urlTemplate) {
      return source.urlTemplate.replace("{word}", encodeURIComponent(entry.sourceWord || entry.word));
    }
    return source.url;
  }

  function fillSources(entry) {
    const list = $("sources");
    list.replaceChildren();
    for (const id of entry.sourceIds || []) {
      const source = manifest.sources[id];
      if (!source) continue;
      const li = document.createElement("li");
      const url = sourceUrl(source, entry);
      if (url) {
        const link = document.createElement("a");
        link.href = url;
        link.textContent = source.name;
        link.target = "_blank";
        link.rel = "noopener";
        li.append(link, document.createTextNode(` – ${source.license}`));
      } else {
        li.textContent = `${source.name} – ${source.license}`;
      }
      list.append(li);
    }
    if (!list.children.length) {
      const li = document.createElement("li");
      li.textContent = "Keine Quellenangabe.";
      list.append(li);
    }
  }

  function showEntry(entry, matched, focusHeading = true) {
    currentEntry = entry;
    currentMatched = matched;
    clear();
    const shownWord = localized(entry.word);
    $("wordHeading").textContent = shownWord;
    $("resultSummary").textContent = normalize(matched) !== normalize(entry.word)
      ? `Über die Wortform „${localized(matched)}“ gefunden.`
      : "Wörterbucheintrag.";
    $("grammar").replaceChildren();
    addDefinition("Wortart", entry.partOfSpeech);
    addDefinition("Artikel", entry.gender);
    fillList(
      "forms",
      (entry.forms || []).map((form) => form.form + (form.tags?.length ? ` – ${form.tags.join(", ")}` : "")),
      "Keine Formen angegeben.",
    );
    const separation = typeof entry.hyphenation === "string"
      ? entry.hyphenation
      : entry.hyphenation?.[locale];
    const displayedSeparation = localized(separation);
    $("hyphenation").textContent = displayedSeparation
      ? displayedSeparation.replace(/·/g, "-")
      : "Keine Angabe.";
    fillList("meanings", (entry.senses || []).map((sense) => sense.definition), "Keine Bedeutung angegeben.");
    $("synonyms").textContent = entry.synonyms?.length
      ? entry.synonyms.map(localized).join(", ")
      : "Keine Angabe.";
    fillList("origins", entry.origins || [], "Keine Herkunft angegeben.");
    fillExamples(entry);
    fillList("idioms", entry.idioms || [], "Keine Redewendungen angegeben.");
    fillList(
      "collocations",
      entry.collocations || [],
      "Keine Angabe in der verwendeten maschinenlesbaren Quelle.",
    );
    fillList("derivations", entry.derivations || [], "Keine Wortbildungen angegeben.");
    fillSources(entry);
    result.hidden = false;
    applySectionVisibility();
    const meaningCount = (entry.senses || []).length;
    status.textContent = `${shownWord} gefunden. ${meaningCount} Bedeutung${meaningCount === 1 ? "" : "en"}.`;
    if (focusHeading) $("wordHeading").focus();
  }

  async function getEntries(references) {
    const byShard = new Map();
    for (const reference of references) {
      const shard = reference.split(":", 1)[0];
      if (!byShard.has(shard)) byShard.set(shard, []);
      byShard.get(shard).push(reference);
    }
    await Promise.all([...byShard.keys()].map((shard) => loadScript("entries", shard)));
    return references
      .map((reference) => {
        const shard = reference.split(":", 1)[0];
        return window.DICTIONARY_ENTRY_SHARDS[shard]?.[reference];
      })
      .filter(Boolean);
  }

  function showChoices(choices, heading, intro, statusText) {
    currentEntry = null;
    currentMatched = "";
    clear();
    $("suggestionHeading").textContent = heading;
    $("suggestionIntro").textContent = intro;
    for (const choice of choices) {
      const li = document.createElement("li");
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = choice.label;
      button.onclick = choice.action;
      li.append(button);
      $("suggestionList").append(li);
    }
    suggestions.hidden = false;
    status.textContent = statusText;
    $("suggestionHeading").focus();
  }

  async function exact(raw) {
    const key = normalize(raw);
    const shard = prefix(key, 2);
    await loadScript("search", shard);
    const references = window.DICTIONARY_SEARCH_SHARDS[shard]?.[key] || [];
    return getEntries(references);
  }

  async function spelling(raw) {
    const shard = prefix(raw, 1);
    await loadScript("suggest", shard);
    const words = window.DICTIONARY_SUGGESTION_SHARDS[shard] || [];
    const maximum = Math.max(2, Math.floor(normalize(raw).length / 3));
    return words
      .filter((word) => Math.abs(normalize(word).length - normalize(raw).length) <= maximum)
      .map((word) => ({ word, distance: distance(raw, word) }))
      .filter((item) => item.distance <= maximum)
      .sort((a, b) => itemSort(a, b))
      .slice(0, 5)
      .map((item) => item.word);
  }

  function itemSort(a, b) {
    return a.distance - b.distance || a.word.localeCompare(b.word, locale);
  }

  async function search() {
    const raw = query.value.trim();
    if (!raw) {
      clear();
      status.textContent = "Bitte ein Wort eingeben.";
      query.focus();
      return;
    }
    setBusy(true);
    status.textContent = `${raw} wird im lokalen Wörterbuch gesucht.`;
    try {
      let found = await exact(raw);
      const directHeadwords = found.filter((entry) => normalize(entry.word) === normalize(raw));
      if (directHeadwords.length) found = directHeadwords;
      if (found.length === 1) {
        showEntry(found[0], raw);
        return;
      }
      if (found.length > 1) {
        showChoices(
          found.map((entry) => ({
            label: `${localized(entry.word)}, ${localized(entry.partOfSpeech)}`,
            action: () => {
              query.value = localized(entry.word);
              showEntry(entry, raw);
            },
          })),
          `Mehrere Einträge für „${localized(raw)}“`,
          "Bitte wählen:",
          `${found.length} Einträge für ${localized(raw)} gefunden.`,
        );
        return;
      }
      const proposed = await spelling(raw);
      if (proposed.length) {
        showChoices(
          proposed.map((word) => ({
            label: localized(word),
            action: () => {
              query.value = localized(word);
              search();
            },
          })),
          `„${localized(raw)}“ wurde nicht gefunden`,
          "Meinten Sie:",
          proposed.length === 1
            ? "1 Schreibvorschlag verfügbar."
            : `${proposed.length} Schreibvorschläge verfügbar.`,
        );
      } else {
        currentEntry = null;
        currentMatched = "";
        clear();
        status.textContent = `${localized(raw)} wurde nicht gefunden. Kein passender Schreibvorschlag im lokalen Datenbestand.`;
        status.focus();
      }
    } catch (_) {
      currentEntry = null;
      currentMatched = "";
      clear();
      status.textContent = "Fehler beim Lesen der lokalen Wörterbuchdateien. Bitte den Ordner vollständig entpacken.";
      status.focus();
    } finally {
      setBusy(false);
    }
  }

  function selectLocale(nextLocale, announce = true) {
    if (!manifest.locales?.includes(nextLocale)) return;
    locale = nextLocale;
    document.documentElement.lang = locale;
    $("localeCH").checked = locale === "de-CH";
    $("localeDE").checked = locale === "de-DE";
    $("languageDescription").textContent = locale === "de-CH"
      ? "Schweizer Schreibweise, zum Beispiel Strasse. Die Suche akzeptiert auch Straße."
      : "Deutsche Schreibweise, zum Beispiel Straße. Die Suche akzeptiert auch Strasse.";
    try {
      localStorage.setItem("barrierefreies-woerterbuch-locale", locale);
    } catch (_) {
      // Die Auswahl gilt mindestens bis zum Schliessen dieser Seite.
    }
    if (currentEntry) showEntry(currentEntry, currentMatched, false);
    if (announce) {
      status.textContent = locale === "de-CH"
        ? "Wörterbuchsprache: Deutsch Schweiz."
        : "Wörterbuchsprache: Deutsch Deutschland.";
    }
  }

  $("searchButton").onclick = search;
  aboutOpen.addEventListener("click", () => {
    if (typeof aboutDialog.showModal === "function") {
      aboutDialog.showModal();
    } else {
      aboutDialog.setAttribute("open", "");
    }
    $("aboutHeading").focus();
  });
  aboutClose.addEventListener("click", () => {
    if (typeof aboutDialog.close === "function") aboutDialog.close();
    else {
      aboutDialog.removeAttribute("open");
      aboutOpen.focus();
    }
  });
  aboutDialog.addEventListener("close", () => aboutOpen.focus());
  query.onkeydown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      search();
    }
  };
  for (const radio of document.querySelectorAll('input[name="locale"]')) {
    radio.addEventListener("change", () => {
      if (radio.checked) selectLocale(radio.value);
    });
  }
  for (const option of sectionOptions) {
    $(option.control).addEventListener("change", () => {
      visibleSections[option.section] = $(option.control).checked;
      saveSectionVisibility();
      applySectionVisibility();
      status.textContent = `${option.label} ${visibleSections[option.section] ? "eingeblendet" : "ausgeblendet"}.`;
    });
  }

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      if (aboutDialog.hasAttribute("open")) {
        if (typeof aboutDialog.close === "function") aboutDialog.close();
        else {
          aboutDialog.removeAttribute("open");
          aboutOpen.focus();
        }
        return;
      }
      query.focus();
      query.select();
      status.textContent = "Suchfeld.";
      return;
    }
    if (!event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key.toLocaleLowerCase("de");
    const targets = {
      s: "query",
      e: "settingsSummary",
      b: "meaningHeading",
      w: "hyphenationHeading",
      g: "grammarHeading",
      f: "formsHeading",
      y: "synonymHeading",
      h: "originHeading",
      p: "examplesHeading",
      r: "idiomsHeading",
      k: "collocationHeading",
      d: "derivationHeading",
      q: "sourceHeading",
    };
    if (!targets[key]) return;
    event.preventDefault();
    if (key === "s") {
      query.focus();
      query.select();
      status.textContent = "Suchfeld.";
    } else if (key === "e") {
      $("settings").open = true;
      $("settingsSummary").focus();
    } else if (!result.hidden) {
      const target = $(targets[key]);
      const section = target.closest("section");
      if (section?.hidden) {
        const option = sectionOptions.find((item) => item.section === section.id);
        status.textContent = `${option?.label || "Diese Rubrik"} ist ausgeblendet. Sie kann in den Einstellungen wieder eingeblendet werden.`;
        $("settings").open = true;
        $("settingsSummary").focus();
      } else {
        target.focus();
      }
    } else {
      status.textContent = "Zuerst ein Wort suchen.";
      query.focus();
    }
  });

  applySectionVisibility();
  selectLocale(locale, false);
  status.textContent = `Bereit. ${manifest.entryCount.toLocaleString(locale)} lokale Einträge geladen. Datenstand ${manifest.generatedAt}.`;
  query.focus();
})();
