# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import asyncio
from typing import Dict, Any, Literal, Optional
import functools 

from langgraph.graph import StateGraph, START, END
from . import models
from . import graph_nodes
from .utils import setup_logger
from .sub_workers.research_comptroller import ResearchComptroller # Import Comptroller

logger = setup_logger(__name__, level="WARN") 

# --- Conditional Edge Logic Functions ---

def should_continue_hopping(state: models.OverallState, services: Dict[str, Any]) -> Literal["web_search", "synthesize_report"]:
    """
    Determines if more research hops are needed or if it's time to synthesize.
    """
    task_id = state.task_id
    comptroller: Optional[ResearchComptroller] = services.get("research_comptroller")

    # Priority 1: Handle Comptroller Review Failure
    if state.is_comptroller_review_failed:
        if state.comptroller_hop_credits > 0:
            logger.info(f"[{task_id}] Comptroller review failed. Credits remaining: {state.comptroller_hop_credits}. Routing to web_search for re-research.")
            return "web_search"
        else: # Credits are <= 0
            logger.warning(f"[{task_id}] Comptroller review failed AND no credits remaining ({state.comptroller_hop_credits}). Forcing synthesis.")
            return "synthesize_report"

    if state.comptroller_hop_credits <= 0:
        logger.warning(f"[{task_id}] Comptroller hop credits exhausted ({state.comptroller_hop_credits}). Forcing synthesis.")
        return "synthesize_report"
        
    if state.is_cancelled_flag.is_set(): # Corrected check for asyncio.Event
        logger.info(f"[{task_id}] Task cancelled. Routing to synthesize_report.")
        return "synthesize_report"

    if comptroller:
        if comptroller.check_hard_constraints(state): # This might check max_hops internally
            logger.warning(f"[{task_id}] Comptroller mandated a hard stop. Routing to synthesize_report.")
            return "synthesize_report"
            
    if state.current_hop >= state.max_hops:
        logger.info(f"[{task_id}] General max hops ({state.max_hops}) reached. Routing to synthesize_report.")
        return "synthesize_report"

    if state.consecutive_stagnation_hops >= 2:
        logger.info(f"[{task_id}] Research has stagnated for {state.consecutive_stagnation_hops} hops. Routing to synthesize_report.")
        return "synthesize_report"
    
    has_new_queries = bool(state.current_queries_for_hop)
    has_links_to_explore = bool(state.links_to_explore_pq)

    if not has_new_queries and not has_links_to_explore:
        logger.info(f"[{task_id}] No new queries and no links to explore. Routing to synthesize_report.")
        return "synthesize_report"
    
    logger.info(f"[{task_id}] Conditions met to continue hopping. Routing to web_search_node.")
    return "web_search"

def handle_search_outcome(state: models.OverallState) -> Literal["process_content", "prepare_next_hop"]:
    """
    Checks if the web search returned any results. If not, skips content processing.
    """
    if not state.search_results_this_hop:
        logger.warning(f"[{state.task_id}] Conditional edge: Web search returned no results. Skipping content processing and preparing for next hop.")
        return "prepare_next_hop"
    logger.info(f"[{state.task_id}] Conditional edge: Web search returned {len(state.search_results_this_hop)} results. Proceeding to process content.")
    return "process_content"


# --- Graph Definition ---

def create_research_graph(services: Dict[str, Any], output_queue: asyncio.Queue) -> StateGraph:
    """
    Creates and compiles the LangGraph for the deep research process.
    """
    builder = StateGraph(models.OverallState)

    # Wrapper for conditional edges that need services
    def _bind_conditional_edge_args(conditional_func):
        @functools.wraps(conditional_func)
        def wrapped_conditional_edge(state: models.OverallState): # LangGraph passes state
            # 'services' is available in the scope of create_research_graph
            return conditional_func(state, services) 
        return wrapped_conditional_edge
    
    def _bind_node_args(node_func):
        @functools.wraps(node_func)
        async def wrapped_node(state: models.OverallState): 
            return await node_func(state, services, output_queue)
        return wrapped_node

    builder.add_node("initialize_task", _bind_node_args(graph_nodes.initialize_task_node))
    builder.add_node("web_search", _bind_node_args(graph_nodes.web_search_node))
    builder.add_node("process_content", _bind_node_args(graph_nodes.process_content_node))
    builder.add_node("analyze_content", _bind_node_args(graph_nodes.analyze_content_node))
    builder.add_node("extract_links", _bind_node_args(graph_nodes.extract_links_node))
    builder.add_node("prepare_next_hop", _bind_node_args(graph_nodes.prepare_next_hop_node))
    builder.add_node("synthesize_report", _bind_node_args(graph_nodes.synthesize_report_node))
    builder.add_node("generate_follow_ups", _bind_node_args(graph_nodes.generate_follow_ups_node))
    builder.add_node("finalize_task", _bind_node_args(graph_nodes.finalize_task_node))

    builder.add_edge(START, "initialize_task")
    builder.add_edge("initialize_task", "web_search")
    
    builder.add_conditional_edges(
        "web_search",
        handle_search_outcome,
        {
            "process_content": "process_content",
            "prepare_next_hop": "prepare_next_hop"
        }
    )

    builder.add_edge("process_content", "analyze_content")
    builder.add_edge("analyze_content", "extract_links")
    builder.add_edge("extract_links", "prepare_next_hop")

    builder.add_conditional_edges(
        "prepare_next_hop",
        _bind_conditional_edge_args(should_continue_hopping),
        {
            "web_search": "web_search",
            "synthesize_report": "synthesize_report"
        }
    )

    # Corrected Flow: After synthesis, decide whether to loop back for more research or generate follow-ups.
    builder.add_conditional_edges(
        "synthesize_report",
        lambda state: "prepare_next_hop" if state.is_comptroller_review_failed else "generate_follow_ups",
        {
            "prepare_next_hop": "prepare_next_hop",
            "generate_follow_ups": "generate_follow_ups",
        }
    )
    
    # Corrected Flow: Generate follow-ups after synthesis, then finalize.
    builder.add_edge("generate_follow_ups", "finalize_task")
    builder.add_edge("finalize_task", END)
    
    graph = builder.compile()
    return graph

if __name__ == '__main__':
    pass
