#!/usr/bin/env python3
import json
import re
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PLAYGROUND = ROOT / "playground"
CATALOG = ROOT / "catalog"

ALIASES = {
    "ohms-law-playground": ["ohms-law"],
    "light-reflection-playground": ["light-reflection"],
    "light-refraction-playground": ["light-refraction"],
    "class-10-human-eye-vision-correction": ["human-eye-vision"],
    "class-10-solenoid-electromagnet": ["solenoid-electromagnet"],
}


class MetadataParser(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=False)
        self.inside = False
        self.parts = []

    def handle_starttag(self, tag, attrs):
        if tag.lower() == "script":
            attrs = {k.lower(): v for k, v in attrs}
            self.inside = (
                attrs.get("id") == "experiment-metadata"
                and (attrs.get("type") or "").lower() == "application/json"
            )

    def handle_data(self, data):
        if self.inside:
            self.parts.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "script" and self.inside:
            self.inside = False

    def result(self):
        raw = "".join(self.parts).strip()
        if not raw:
            return None
        value = json.loads(raw)
        if not isinstance(value, dict):
            raise ValueError("Experiment metadata must be a JSON object")
        return value


def parse_metadata(index_file):
    parser = MetadataParser()
    parser.feed(index_file.read_text(encoding="utf-8"))
    data = parser.result()

    if data is None:
        return None

    required = ("id", "title", "class", "chapter", "description")
    missing = [key for key in required if data.get(key) in (None, "")]
    if missing:
        raise ValueError(
            f"{index_file}: missing fields: {', '.join(missing)}"
        )

    experiment_id = str(data["id"]).strip()
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*", experiment_id):
        raise ValueError(f"Invalid experiment ID: {experiment_id}")

    result = {
        "id": experiment_id,
        "title": str(data["title"]).strip(),
        "class": int(data["class"]),
        "chapter": str(data["chapter"]).strip(),
        "description": str(data["description"]).strip(),
        "simulationType": str(data.get("simulationType", "2D")).upper()
    }

    if result["simulationType"] not in ("2D", "3D"):
        raise ValueError("simulationType must be 2D or 3D")

    if data.get("chapterNumber") not in (None, ""):
        result["chapterNumber"] = int(data["chapterNumber"])

    return result


def normalise_path(value):
    if not isinstance(value, str) or not value.strip():
        return None

    value = value.strip().replace("\\", "/")
    value = re.sub(r"^\./+", "", value)

    if value.startswith("playground/"):
        value = value[len("playground/"):]

    if value.startswith("/") or ".." in Path(value).parts:
        return None

    if not re.fullmatch(r"[A-Za-z0-9._/-]+", value):
        return None

    return value.rstrip("/") + "/"


def has_index(relative_path):
    if not relative_path:
        return False

    target = (PLAYGROUND / relative_path / "index.html").resolve()

    try:
        target.relative_to(PLAYGROUND.resolve())
    except ValueError:
        return False

    return target.is_file()


def folder_candidates(experiment_id):
    stripped = re.sub(r"^class-\d+-", "", experiment_id)

    names = ALIASES.get(experiment_id, []) + [
        stripped,
        experiment_id
    ]

    if stripped.endswith("-playground"):
        names.append(stripped[:-len("-playground")])

    result = []

    for name in names:
        if (
            name
            and name not in result
            and re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9-]*", name)
        ):
            result.append(name)

    return result


def discover_path(subject, experiment):
    current = normalise_path(experiment.get("simulationPath"))

    if current and has_index(current):
        return current

    experiment_id = str(experiment.get("id") or "").strip()

    for folder in folder_candidates(experiment_id):
        candidate = f"simulations/{subject}/{folder}/"

        if has_index(candidate):
            return candidate

    return None


def sync_subject(subject):
    catalogue_file = CATALOG / f"{subject}.json"

    data = json.loads(
        catalogue_file.read_text(encoding="utf-8")
    )

    experiments = data.get("experiments")

    if not isinstance(experiments, list):
        raise ValueError("Catalogue experiments must be an array")

    changed = False

    by_id = {
        str(item["id"]): item
        for item in experiments
        if isinstance(item, dict) and item.get("id")
    }

    # Read metadata from new simulation HTML files.
    sim_root = PLAYGROUND / "simulations" / subject

    if sim_root.is_dir():
        seen = set()

        for index_file in sorted(sim_root.glob("*/index.html")):
            metadata = parse_metadata(index_file)

            if metadata is None:
                continue

            experiment_id = metadata["id"]

            if experiment_id in seen:
                raise ValueError(
                    f"Duplicate metadata ID: {experiment_id}"
                )

            seen.add(experiment_id)

            relative = (
                f"simulations/{subject}/{index_file.parent.name}/"
            )

            item = by_id.get(experiment_id)

            if item is None:
                item = {}
                experiments.append(item)
                by_id[experiment_id] = item
                changed = True
                print(f"Added {subject} experiment: {experiment_id}")

            for key, value in metadata.items():
                if item.get(key) != value:
                    item[key] = value
                    changed = True

            if item.get("simulationPath") != relative:
                item["simulationPath"] = relative
                changed = True
                print(f"Linked {experiment_id}: {relative}")

    # Link existing catalogue records to their real folders.
    for item in experiments:
        if not isinstance(item, dict) or not item.get("id"):
            continue

        found = discover_path(subject, item)
        current = normalise_path(item.get("simulationPath"))

        if found:
            if item.get("simulationPath") != found:
                item["simulationPath"] = found
                changed = True
                print(f"Linked {item['id']}: {found}")

        elif current:
            item.pop("simulationPath", None)
            changed = True
            print(f"Marked in development: {item['id']}")

    # Automatically include any newly introduced class.
    if isinstance(data.get("classes"), list):
        classes = data["classes"]
        existing = {int(x) for x in classes if str(x).isdigit()}

        for item in experiments:
            try:
                class_number = int(item.get("class"))
            except (TypeError, ValueError, AttributeError):
                continue

            if class_number not in existing:
                classes.append(class_number)
                existing.add(class_number)
                changed = True

        if changed:
            classes.sort(key=int)

    if changed:
        catalogue_file.write_text(
            json.dumps(data, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8"
        )
        print(f"Prepared {catalogue_file.name} for publishing")
    else:
        print(f"No changes needed in {catalogue_file.name}")


def main():
    for subject in ("physics", "chemistry"):
        catalogue_file = CATALOG / f"{subject}.json"

        if not catalogue_file.is_file():
            raise FileNotFoundError(catalogue_file)

        sync_subject(subject)

    print("Both catalogues are ready for deployment.")


if __name__ == "__main__":
    main()
