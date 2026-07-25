"""
gemini_client.py
----------------
Thin wrapper around the google-genai SDK, configured for Vertex AI so it
authenticates with the SAME service account you use for BigQuery
(GOOGLE_APPLICATION_CREDENTIALS / Application Default Credentials).

No GEMINI_API_KEY needed. Everything stays inside your Google Cloud project.

The wrapper exposes `.generate_content(contents)` returning a response with a
`.text` attribute, so the rest of the codebase (recipe_service, main) can call
it exactly like the old google-generativeai model object — no other changes.

  - text prompt:  model.generate_content("some prompt")            -> response.text
  - image + text: model.generate_content([prompt, image_part])     -> response.text
    where image_part = build_image_part(image_bytes, mime_type)
"""

from google import genai
from google.genai import types


class VertexGemini:
    def __init__(self, project: str, location: str, model_name: str):
        # vertexai=True -> uses ADC (your service account). No API key involved.
        self._client = genai.Client(vertexai=True, project=project, location=location)
        self._model = model_name

    def generate_content(self, contents):
        """`contents` may be a string, or a list of strings / Part objects."""
        return self._client.models.generate_content(
            model=self._model,
            contents=contents,
        )


def build_image_part(image_bytes: bytes, mime_type: str = "image/jpeg"):
    """Wrap raw image bytes as a Gemini content Part (for the pantry scan)."""
    return types.Part.from_bytes(data=image_bytes, mime_type=mime_type or "image/jpeg")