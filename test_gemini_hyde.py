# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import asyncio
import json
import os

import litellm

# Suppress LiteLLM telemetry and verbose logging if desired
os.environ['LITELLM_DISABLE_TELEMETRY'] = '1'
litellm.suppress_debug_info = True
# litellm.set_verbose = True # Uncomment for very detailed LiteLLM logs


async def call_gemini_hyde():
    query = "Circle just released his stablecoin onto the XRP ledger, and the GENIUS Act was approved in the US senate. What could be the impacts on that? Conclude from current development, create an educated outlook."

    # This is the HyDE prompt structure for Gemini from llm_reasoning.py
    hyde_prompt_for_gemini = f"""Write a short, factual paragraph that directly answers the following question:
Question: \"{query}\"
"""

    model_id = "gemini/gemini-2.5-flash-preview-05-20"
    temperature = 0.3
    messages = [{"role": "user", "content": hyde_prompt_for_gemini}]

    # Require API key via environment variable only.
    api_key_to_use = os.getenv("GOOGLE_API_KEY")
    if not api_key_to_use:
        raise RuntimeError("GOOGLE_API_KEY environment variable is required for this test.")

    params = {
        "model": model_id,
        "messages": messages,
        "temperature": temperature,
        "stop": None,
        "stream": True,
        "api_key": api_key_to_use,
    }

    print("--- Sending request to LiteLLM with parameters: ---")
    print(json.dumps({"model": model_id, "temperature": temperature, "stream": True}, indent=2))
    print("----------------------------------------------------")

    try:
        response_stream = await litellm.acompletion(**params)

        full_response_content = ""
        finish_reason = None

        print("\n--- LiteLLM Streamed Chunks: ---")
        async for chunk in response_stream:
            print(chunk)
            if chunk.choices and chunk.choices[0].delta and chunk.choices[0].delta.content:
                full_response_content += chunk.choices[0].delta.content
            if chunk.choices and chunk.choices[0].finish_reason:
                finish_reason = chunk.choices[0].finish_reason

        print("\n--- Aggregated Content from Stream: ---")
        if full_response_content:
            print(full_response_content)
        else:
            print("No content aggregated from stream.")

        if finish_reason:
            print(f"Finish Reason from stream: {finish_reason}")

        print("\n--- Usage Data (Note: May be incomplete or absent for streams depending on provider/LiteLLM): ---")
        print("Usage data for streamed responses is typically found on the final non-streamed response object if available,")
        print("or sometimes on the first/last chunk in a stream. For this test, we are focusing on content.")

    except Exception as e:
        print("\n--- Error during LiteLLM call: ---")
        print(f"{type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()


if __name__ == "__main__":
    asyncio.run(call_gemini_hyde())
