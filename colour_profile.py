from __future__ import annotations

import argparse
import base64
import json
from dataclasses import dataclass
from io import BytesIO
from math import sqrt
from pathlib import Path
from typing import Any

from PIL import Image, ImageOps


@dataclass(frozen=True)
class SeasonProfile:
    name: str
    axes: dict[str, float]
    palette: list[str]
    wardrobe: str


SEASON_PROFILES: list[SeasonProfile] = [
    SeasonProfile(
        "Light Spring",
        {"temperature": 0.65, "value": -0.78, "chroma": 0.42, "contrast": -0.35},
        ["#f8e7b8", "#f5bc6b", "#ff9d89", "#91d2bd", "#83abd7", "#fff4dc"],
        "light warm neutrals, honey beige, pale turquoise, peach, warm ivory",
    ),
    SeasonProfile(
        "True Spring",
        {"temperature": 1, "value": -0.22, "chroma": 0.78, "contrast": 0},
        ["#ffd166", "#ff8c69", "#36b37e", "#41c7c7", "#fff2c2", "#d98c28"],
        "clear warm colours, golden tan, fresh teal, coral, warm cream",
    ),
    SeasonProfile(
        "Bright Spring",
        {"temperature": 0.35, "value": -0.02, "chroma": 1, "contrast": 0.72},
        ["#ff4f8b", "#00b8a9", "#ffe066", "#2f80ed", "#111827", "#fff7ef"],
        "bright clean accents, blackened navy, crisp ivory, vivid teal, clear pink-red",
    ),
    SeasonProfile(
        "Light Summer",
        {"temperature": -0.42, "value": -0.78, "chroma": -0.2, "contrast": -0.45},
        ["#c7d8ed", "#e8c6d0", "#d8d6ec", "#edf1f3", "#9fb6c8", "#b9d8cf"],
        "cool pale blues, mist grey, dusty rose, soft white, washed denim",
    ),
    SeasonProfile(
        "True Summer",
        {"temperature": -1, "value": -0.24, "chroma": -0.55, "contrast": -0.15},
        ["#7f95ad", "#c9a7b7", "#6b778d", "#e6e9ed", "#8d6f8b", "#b7c7d9"],
        "blue-grey, slate, cool rose, soft navy, brushed silver",
    ),
    SeasonProfile(
        "Soft Summer",
        {"temperature": -0.38, "value": -0.08, "chroma": -1, "contrast": -0.58},
        ["#8fa4a8", "#c6b2bd", "#747d8c", "#dcd8d5", "#9c8796", "#a7b39f"],
        "muted cool neutrals, dusty sage, taupe, soft denim, pewter",
    ),
    SeasonProfile(
        "Soft Autumn",
        {"temperature": 0.38, "value": 0.08, "chroma": -1, "contrast": -0.48},
        ["#8b5e3c", "#c28057", "#6f7557", "#d6b073", "#f1dcc0", "#154f5b"],
        "muted olive, camel, warm taupe, deep teal, brushed gold",
    ),
    SeasonProfile(
        "True Autumn",
        {"temperature": 1, "value": 0.36, "chroma": -0.42, "contrast": 0.08},
        ["#7a4a28", "#b85c38", "#6b7a3b", "#c59b42", "#2f5d50", "#efd8ac"],
        "rich earth tones, tobacco brown, forest, burnt orange, antique gold",
    ),
    SeasonProfile(
        "Dark Autumn",
        {"temperature": 0.48, "value": 0.86, "chroma": -0.1, "contrast": 0.45},
        ["#2a1f1a", "#5a3a21", "#8a3f2d", "#174c49", "#b98233", "#dfc39b"],
        "espresso, deep olive, dark teal, oxblood, warm metal accents",
    ),
    SeasonProfile(
        "Dark Winter",
        {"temperature": -0.5, "value": 0.88, "chroma": 0.25, "contrast": 0.72},
        ["#111827", "#f7f8fb", "#0f5b76", "#8f1d3f", "#4b5563", "#0b3b3e"],
        "black, optic white, deep burgundy, petrol blue, cool charcoal",
    ),
    SeasonProfile(
        "True Winter",
        {"temperature": -1, "value": 0.34, "chroma": 0.68, "contrast": 1},
        ["#050505", "#ffffff", "#0b5fff", "#c1121f", "#008f7a", "#7b2cbf"],
        "black, white, crisp blue, clean red, silver, sharp contrast",
    ),
    SeasonProfile(
        "Bright Winter",
        {"temperature": -0.35, "value": 0.15, "chroma": 1, "contrast": 0.95},
        ["#09090b", "#ffffff", "#ff006e", "#00c2ff", "#6dff8f", "#ffdd00"],
        "electric accents, black and white, icy blue, vivid fuchsia, clean green",
    ),
]


def clamp(value: float, minimum: float = -1, maximum: float = 1) -> float:
    return max(minimum, min(maximum, value))


def axis_label(axis: str, value: float) -> str:
    if axis == "temperature":
        return "warm" if value > 0.2 else "cool" if value < -0.2 else "neutral"
    if axis == "value":
        return "deep" if value > 0.28 else "light" if value < -0.28 else "medium-depth"
    if axis == "chroma":
        return "bright" if value > 0.25 else "soft" if value < -0.25 else "moderate-chroma"
    if axis == "contrast":
        return "high-contrast" if value > 0.25 else "low-contrast" if value < -0.25 else "medium-contrast"
    return "balanced"


def profile_to_dict(profile: SeasonProfile, score: float | None = None) -> dict[str, Any]:
    data: dict[str, Any] = {
        "name": profile.name,
        "axes": profile.axes,
        "palette": profile.palette,
        "wardrobe": profile.wardrobe,
    }
    if score is not None:
        data["score"] = round(score, 1)
    return data


def score_seasons(axes: dict[str, float]) -> list[dict[str, Any]]:
    weights = {"temperature": 1.25, "value": 0.85, "chroma": 1.05, "contrast": 0.82}
    ranked: list[dict[str, Any]] = []
    for profile in SEASON_PROFILES:
        distance = sum(weight * (axes[axis] - profile.axes[axis]) ** 2 for axis, weight in weights.items())
        score = max(0, 100 - sqrt(distance) * 37)
        ranked.append(profile_to_dict(profile, score))
    return sorted(ranked, key=lambda item: item["score"], reverse=True)


def crop_cover(image: Image.Image, size: int = 180) -> Image.Image:
    width, height = image.size
    scale = max(size / width, size / height)
    resized = image.resize((round(width * scale), round(height * scale)), Image.Resampling.LANCZOS)
    left = max(0, (resized.width - size) // 2)
    top = max(0, (resized.height - size) // 2)
    return resized.crop((left, top, left + size, top + size))


def sample_face_image(image_bytes: bytes) -> dict[str, Any]:
    with Image.open(BytesIO(image_bytes)) as raw_image:
        image = ImageOps.exif_transpose(raw_image).convert("RGBA")
        image = crop_cover(image)

    size = image.width
    pixels = image.load()
    samples: list[dict[str, float]] = []
    center_x = size / 2
    center_y = size * 0.43
    radius_x = size * 0.28
    radius_y = size * 0.34

    for y in range(0, size, 2):
        for x in range(0, size, 2):
            normalized = ((x - center_x) / radius_x) ** 2 + ((y - center_y) / radius_y) ** 2
            if normalized > 1:
                continue
            r, g, b, alpha = pixels[x, y]
            if alpha < 200:
                continue
            luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
            colour_range = max(r, g, b) - min(r, g, b)
            if luma < 35 or luma > 245 or colour_range > 170:
                continue
            samples.append({"r": r, "g": g, "b": b, "luma": luma, "range": colour_range})

    if not samples:
        raise ValueError("Could not sample enough face pixels. Try a clearer front-facing photo.")

    count = len(samples)
    avg = {
        "r": sum(pixel["r"] for pixel in samples) / count,
        "g": sum(pixel["g"] for pixel in samples) / count,
        "b": sum(pixel["b"] for pixel in samples) / count,
        "luma": sum(pixel["luma"] for pixel in samples) / count,
        "saturation": sum(pixel["range"] for pixel in samples) / count / 255,
    }
    variance = sum((pixel["luma"] - avg["luma"]) ** 2 for pixel in samples) / count
    luma_std = sqrt(variance)

    axes = {
        "temperature": clamp((avg["r"] - avg["b"]) / 55),
        "value": clamp((145 - avg["luma"]) / 85),
        "chroma": clamp((avg["saturation"] - 0.24) / 0.22),
        "contrast": clamp((luma_std - 34) / 28),
    }

    return {"count": count, "axes": axes, "average": avg}


def build_creator_prompt(result: dict[str, Any]) -> str:
    profile = result["profile"]
    palette = ", ".join(profile["palette"])
    axes = result["axes"]
    axis_summary = ", ".join(
        [
            axis_label("temperature", axes["temperature"]),
            axis_label("value", axes["value"]),
            axis_label("chroma", axes["chroma"]),
            axis_label("contrast", axes["contrast"]),
        ]
    )

    return "\n".join(
        [
            "Use the uploaded face photo as the identity reference. Create a sleek men's fashion portrait using the styling direction below.",
            "",
            f"Colour profile: {profile['name']}. Palette hex colours: {palette}. Visual read: {axis_summary}.",
            f"Wardrobe direction: {profile['wardrobe']}. Use a polished night-out / luxury menswear feel with tailored clothing, controlled lighting, and premium textures.",
            "",
            "Identity preservation rules:",
            "- Keep the exact same face identity, face shape, head shape, jawline, cheekbones, forehead, eye shape, eye spacing, nose shape, mouth shape, ears, hairline, hairstyle, facial hair, skin tone, age, and expression.",
            "- Do not beautify, slim, widen, age, de-age, change ethnicity, change eye colour, change hairstyle, change facial hair, or alter the natural face proportions.",
            "- Keep the face angle, camera perspective, and head size close to the reference photo. Do not stretch, warp, liquify, smooth too much, or make the face look like a different person.",
            "- Only change styling elements: outfit, background, lighting, colour palette, accessories, and overall fashion mood.",
            "",
            "Image direction:",
            "A realistic high-end men's style editorial portrait. Tailored fit, clean collar, season-safe near-face colour, subtle luxury styling, natural skin texture, sharp but believable lighting, premium boutique or evening lounge background. Photorealistic, no logos, no text, no watermark.",
            "",
            "Negative prompt:",
            "warped face, changed identity, different person, altered facial structure, distorted eyes, uneven eyes, changed nose, changed lips, changed jawline, plastic skin, over-smoothed face, exaggerated muscles, cartoon, low detail, blurry face, extra fingers, bad hands, watermark, text.",
        ]
    )


def analyze_image_bytes(image_bytes: bytes) -> dict[str, Any]:
    sample = sample_face_image(image_bytes)
    ranked = score_seasons(sample["axes"])
    gap = max(0, ranked[0]["score"] - ranked[1]["score"])
    confidence = round(clamp(58 + gap * 1.4 + min(sample["count"] / 120, 14), 45, 88))
    result = {
        "source": "python",
        "axes": sample["axes"],
        "average": sample["average"],
        "sampleCount": sample["count"],
        "ranked": ranked,
        "profile": ranked[0],
        "season": ranked[0]["name"],
        "palette": ranked[0]["palette"],
        "confidence": confidence,
    }
    result["prompt"] = build_creator_prompt(result)
    return result


def image_bytes_from_data_url(data_url: str) -> bytes:
    if "," not in data_url:
        return base64.b64decode(data_url)
    _, encoded = data_url.split(",", 1)
    return base64.b64decode(encoded)


def main() -> None:
    parser = argparse.ArgumentParser(description="Estimate a face colour season and generate a creator-safe prompt.")
    parser.add_argument("image", type=Path, help="Path to a face image")
    parser.add_argument("--pretty", action="store_true", help="Print indented JSON")
    args = parser.parse_args()

    result = analyze_image_bytes(args.image.read_bytes())
    print(json.dumps(result, indent=2 if args.pretty else None))


if __name__ == "__main__":
    main()
