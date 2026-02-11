# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

class LegalResearchState(BaseModel):
    """
    Represents the state of the legal research graph.
    """
    query: str = Field(
        description="The initial legal question or topic to research."
    )
    api_key: str = Field(
        description="The CourtListener API key to use for requests."
    )
    initial_search_results: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="List of cases returned from the initial CourtListener search."
    )
    error_message: Optional[str] = Field(
        default=None,
        description="An error message if a node fails."
    )
