import re
import unicodedata
import xml.etree.ElementTree as ET
from pathlib import Path

import requests
from bs4 import BeautifulSoup

SOURCES = [
    ("Biomorph", "https://eclipsephase.github.io/en/SUPP/02-CO/03/01-biomorphs.html"),
    ("Uplift Biomorph", "https://eclipsephase.github.io/en/SUPP/02-CO/03/02-uplift-biomorphs.html"),
    ("Pod Biomorph", "https://eclipsephase.github.io/en/SUPP/02-CO/03/03-pod-biomorphs.html"),
    ("Exomorph Biomorph", "https://eclipsephase.github.io/en/SUPP/02-CO/03/04-exomorph-biomorphs.html"),
    ("Synthmorph", "https://eclipsephase.github.io/en/SUPP/02-CO/03/05-synthmorphs.html"),
    ("Infomorph", "https://eclipsephase.github.io/en/SUPP/02-CO/03/06-infomorphs.html"),
    ("Core Morph", "https://eclipsephase.github.io/en/SUPP/02-CO/03/07-core-morphs.html"),
]

EXPECTED = [x for line in '''
Alpiner|Aquanaut|Ariel|Bouncer|Bruiser|Cloud Skate|Crasher|Dvergr|Exalt|Faust|Flat|Freeman|Fury|Futura|Garuda|Ghost|Glider|Venusian Glider Variant|Grey|Hazer|Hibernoid|Hulder|Hyperbright|Imp|Menton|Neotenic|Nomad|Observer|Olympian|Remade|Ring Flyer|Ruster|Salamander|Selkie|Splicer|Surya|Nishakara Variant|Sylph|Theseus
Neo-Avian|Neo-Beluga|Neo-Bonobo/Neo-Chimp|Neo-Dolphin|Neo-Gorilla|Neo-Neanderthal|Neo-Octopus|Neo-Orangutan|Neo-Orca|Neo-Pig|Neo-Porpoise|Neo-Whale
Augur|Ayah|Defender Variant|Basic Pod|Chickcharnie|Critter|Digger|Flying Squid|Hypergibbon|Novacrab|Pleasure Pod|Ripwing|Samsa|Security Pod|Space Marine Variant|Shaper|Traceur|Vac Pod|Worker Pod
Scurrier|Quadruped Variant|Whiplash
Arachnoid|Arachnikoma Variant|Biocore|Case|Cetus|Cloud Skimmer|Courier|Daitya|Combat Mech Variant|Dragonfly|Fenrir|Flexbot|Apiary Module|Aviary Module|Bard Module|Cleric Module|Conjurer Module|Crafter Module|Fighter Module|Rogue Module|Wizard Module|Galatea|Golem Variant|Gargoyle|Griefer|Guard|Prime Variant|Kite|Fierce Kite Variant|Ultra Kite Variant|Mimic|Nautiloid|Oobleck|Opteryx|Ornithope|Blackbird Variant|Q-Morph|Raptor|Reaper|Rover|Savant|Slitheroid|Smart Swarm|Spare|Sphere|Steel Morph|Liquid Silver Variant|Sundiver|Swarmanoid|Skulker Variant|Synth|Synthtaur|Takko|Xu Fu
Agent|Digimorph|Djinn|Echo|Ikon|Neo|Operator|Sage|Spectre
Overmind|Sexton|Warden
'''.splitlines() for x in line.split('|') if x]

assert len(EXPECTED) == 139

HABITATS = {
    "standard": "Standard",
    "scum": "Scum Swarm",
    "mars": "Mars",
    "aquatic": "Aquatic Habitat",
    "saturn": "Saturn",
    "jupiter": "Jupiter",
    "venus": "Venus",
    "uranus": "Uranus",
    "belt": "Main Belt",
    "gate": "Gate / Uplift Habitat",
}

ALIASES = {
    "mars": [("mars", "Mars")],
    "venus": [("venus", "Venus")],
    "titan": [("titan", "Titan")],
    "luna": [("luna", "Luna")],
    "saturn": [("saturn", "Saturn")],
    "jupiter": [("jupiter", "Jupiter")],
    "uranus": [("uranus", "Uranus")],
    "aquatic habs": [("aquatic", "Aquatic Habitat")],
    "aquatic habitat": [("aquatic", "Aquatic Habitat")],
    "micrograv habs": [("micrograv", "Microgravity Habitats")],
    "microgravity habs": [("micrograv", "Microgravity Habitats")],
    "gate habs": [("gate", "Gate Habitats")],
    "gate habitats": [("gate", "Gate Habitats")],
    "high-g exoplanets": [("high-g", "High-G Exoplanets")],
}


def clean(text):
    return " ".join(text.replace(chr(160), " ").split()).strip()


def slug(text):
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return re.sub("[^a-z0-9]+", "-", text).strip("-") or "morph"


def split_items(text):
    parts, current, depth = [], [], 0
    for ch in text:
        if ch == "(":
            depth += 1
        elif ch == ")" and depth:
            depth -= 1
        if ch == "," and depth == 0:
            value = clean("".join(current))
            if value:
                parts.append(value)
            current = []
        else:
            current.append(ch)
    value = clean("".join(current))
    if value:
        parts.append(value)
    return parts


def parse_availability(text):
    match = re.search(r"Avail: +(NA|[0-9]+)", text, re.I)
    base = 0 if not match or match.group(1).upper() == "NA" else int(match.group(1))
    tail = text[match.end():] if match else text
    conditions = []
    for value, place in re.findall(r"([0-9]+) +(in|on|at|around|within) +([^(),]+)", tail, re.I):
        place = clean(place).lower().rstrip(".")
        targets = ALIASES.get(place)
        if targets is None and "/" in place and "uranus" in place and "jupiter" in place:
            targets = [("uranus", "Uranus"), ("jupiter", "Jupiter")]
        if targets is None:
            targets = [(slug(place), place.title())]
        for hid, name in targets:
            conditions.append((hid, name, int(value)))
    return base, list(dict.fromkeys(conditions))


def parse_entry(heading):
    for node in heading.find_all_next():
        if node is not heading and getattr(node, "name", None) == "h2":
            return None
        if getattr(node, "name", None) == "blockquote":
            data = {}
            for li in node.find_all("li"):
                text = clean(li.get_text(" ", strip=True))
                if text.startswith("Cost:"):
                    match = re.search(r"Cost:.*?([0-9]+) MP", text)
                    if match:
                        data["cost"] = int(match.group(1))
                    data["availability"] = text
                elif text.startswith("WT:"):
                    match = re.search(r"WT: +([0-9]+) +[•/] +DUR: +([0-9]+) +[•/] +DR: +([0-9]+)", text)
                    if match:
                        data["stats"] = tuple(map(int, match.groups()))
                elif text.startswith("Insight"):
                    match = re.search(r"Insight +([0-9]+), +Moxie +([0-9]+), +Vigor +([0-9]+), +Flex +([0-9]+)", text)
                    if match:
                        data["aptitudes"] = tuple(map(int, match.groups()))
                elif text.startswith("Movement Rate:"):
                    data["movement"] = text.split(":", 1)[1].strip()
                elif text.startswith("Ware:"):
                    data["ware"] = text.split(":", 1)[1].strip()
                elif text.startswith("Morph Traits:"):
                    data["traits"] = text.split(":", 1)[1].strip()
                elif text.startswith("Common Extras:"):
                    data["extras"] = text.split(":", 1)[1].strip()
                elif text.startswith("Notes:"):
                    data["notes"] = text.split(":", 1)[1].strip()
            return data
    return None


def main():
    session = requests.Session()
    session.headers["User-Agent"] = "symmetrical-octo-goggles/2e-morph-import"
    morphs = {}
    habitats = dict(HABITATS)

    for category, url in SOURCES:
        response = session.get(url, timeout=60)
        response.raise_for_status()
        soup = BeautifulSoup(response.text, "html.parser")
        for heading in soup.find_all("h2"):
            name = clean(heading.get_text(" ", strip=True)).replace(" / ", "/")
            if name in {"Biomorphs", "Uplift Biomorphs", "Pod Biomorphs", "Exomorph Biomorphs", "Synthmorphs", "Infomorphs", "Core Morphs"}:
                continue
            data = parse_entry(heading)
            if not data or "cost" not in data or "availability" not in data:
                continue
            base, conditions = parse_availability(data["availability"])
            for hid, name2, _ in conditions:
                habitats[hid] = name2
            if name in morphs:
                raise RuntimeError(f"Duplicate morph: {name}")
            morphs[name] = {
                "id": slug(name), "name": name, "type": category, "cost": data["cost"],
                "avail": 0 if name.endswith("Module") else base, "conditions": conditions,
                "stats": data.get("stats"), "aptitudes": data.get("aptitudes"),
                "movement": data.get("movement"), "ware": data.get("ware"),
                "traits": data.get("traits"), "extras": data.get("extras"), "notes": data.get("notes"),
            }

    found = set(morphs)
    expected = set(EXPECTED)
    missing = sorted(expected - found)
    unexpected = sorted(found - expected)
    if missing or unexpected or len(found) != 139:
        print("FOUND", len(found))
        print("MISSING", missing)
        print("UNEXPECTED", unexpected)
        raise RuntimeError("Morph guide verification failed")

    root = ET.Element("bodybank")
    habitats_node = ET.SubElement(root, "habitats")
    for hid, name in sorted(habitats.items()):
        node = ET.SubElement(habitats_node, "habitat", id=hid)
        ET.SubElement(node, "name").text = name

    morphs_node = ET.SubElement(root, "morphs")
    for morph in sorted(morphs.values(), key=lambda x: (x["type"], x["name"].lower())):
        node = ET.SubElement(morphs_node, "morph", id=morph["id"], name=morph["name"], type=morph["type"])
        ET.SubElement(node, "cost").text = str(morph["cost"])
        availability = ET.SubElement(node, "availability", base=str(morph["avail"]))
        for hid, _, value in morph["conditions"]:
            ET.SubElement(availability, "habitat", id=hid, value=str(value))
        if morph["stats"]:
            stats = ET.SubElement(node, "stats")
            for tag, value in zip(("wt", "dur", "dr"), morph["stats"]):
                ET.SubElement(stats, tag).text = str(value)
        if morph["aptitudes"]:
            apt = ET.SubElement(node, "aptitudes")
            for tag, value in zip(("insight", "moxie", "vigor", "flex"), morph["aptitudes"]):
                ET.SubElement(apt, tag).text = str(value)
        if morph["movement"]:
            movement = ET.SubElement(node, "movement")
            for item in split_items(morph["movement"]):
                match = re.match(r"(.+) +([0-9]+)/([0-9]+)$", item)
                if match:
                    ET.SubElement(movement, "rate", mode=match.group(1), normal=match.group(2), running=match.group(3))
        for source, tag in (("ware", "ware"), ("traits", "morphTraits"), ("extras", "commonExtras")):
            if morph[source]:
                parent = ET.SubElement(node, tag)
                for item in split_items(morph[source]):
                    ET.SubElement(parent, "item").text = item
        if morph["notes"]:
            ET.SubElement(node, "notes").text = morph["notes"]

    ET.indent(root, space="    ")
    Path("morphs.xml").write_text(ET.tostring(root, encoding="unicode") + "\n", encoding="utf-8")
    print("Imported and verified 139 guide entries")


if __name__ == "__main__":
    main()
