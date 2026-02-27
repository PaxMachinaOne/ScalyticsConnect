# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import requests
from .models import LegalResearchState

COURTLISTENER_API_BASE_URL = "https://www.courtlistener.com/api/rest/v4"

def initial_search(state: LegalResearchState) -> LegalResearchState:
    """
    Performs the initial search on CourtListener based on the user's query.
    """
    if not state.api_key:
        state.error_message = "CourtListener API key was not provided in the state."
        return state

    headers = {"Authorization": f"Token {state.api_key}"}
    params = {"q": state.query, "type": "o"}  # 'o' for opinions

    try:
        response = requests.get(
            f"{COURTLISTENER_API_BASE_URL}/search/",
            headers=headers,
            params=params
        )
        response.raise_for_status()  # Raise an exception for bad status codes
        data = response.json()
        state.initial_search_results = data.get("results", [])

    except requests.exceptions.RequestException as e:
        state.error_message = f"API request failed: {e}"
    
    return state
