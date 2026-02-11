# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
from langgraph.graph import StateGraph, END
from .models import LegalResearchState
from .legal_research_nodes import initial_search

def should_continue(state: LegalResearchState) -> str:
    """
    Determines whether to continue the research or end the process.
    For now, it will always end after the initial search.
    """
    if state.error_message:
        return "end"
    # This will be expanded with more complex logic later
    return "end"

# Define the graph
workflow = StateGraph(LegalResearchState)

# Add the nodes
workflow.add_node("initial_search", initial_search)

# Set the entry point
workflow.set_entry_point("initial_search")

# Add the conditional edge
workflow.add_conditional_edges(
    "initial_search",
    should_continue,
    {
        "end": END
    }
)

# Compile the graph
legal_research_graph = workflow.compile()
