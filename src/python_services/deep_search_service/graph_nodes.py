# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import asyncio
from typing import Dict, List, Any, Optional, Set, Tuple
import uuid
import random 
from datetime import datetime, timezone
import heapq 
import re 
import numpy as np 
from langdetect import detect, LangDetectException

from . import models
from . import config as app_config
from .sub_workers.llm_reasoning import LLMReasoning
from .sub_workers.content_vector import get_content_vector, ContentVector
from .sub_workers.search_scrape import SearchScrape
from .sub_workers.research_comptroller import ResearchComptroller
from .utils import setup_logger, agent_dialogue, citations 
import logging

logger = setup_logger(__name__, level="WARNING")

def calculate_enhanced_quality_score(chunk: models.ContentChunk, vector_similarity: float, query_keywords: Set[str]) -> float:
    """Calculate comprehensive quality score for chunk ranking"""
    
    semantic_score = vector_similarity
    text_length_score = min(len(chunk.text_content) / 1000, 1.0) if chunk.text_content else 0
    chunk_keywords = set(re.findall(r'\b\w+\b', chunk.text_content.lower())) if chunk.text_content else set()
    keyword_overlap = len(query_keywords.intersection(chunk_keywords)) / max(len(query_keywords), 1)
    trust_score = chunk.vector_metadata.get("trust_score", 0.5) if chunk.vector_metadata else 0.5
    
    quality_penalties = 0
    if chunk.text_content:
        text_lower = chunk.text_content.lower()
        low_quality_patterns = ["click here", "read more", "advertisement", "cookie policy"]
        for pattern in low_quality_patterns:
            if pattern in text_lower:
                quality_penalties += 0.1
    
    domain_boost = 0
    if chunk.original_url:
        domain = chunk.original_url.split('/')[2] if '/' in chunk.original_url else ''
        high_quality_domains = ['.edu', '.gov', '.org', 'nytimes', 'reuters', 'bloomberg', 'nature']
        if any(domain.endswith(tld) for tld in high_quality_domains):
            domain_boost = 0.2
        elif 'wiki' in domain:
            domain_boost = 0.1
    
    final_score = (
        semantic_score * 0.5 +
        trust_score * 0.15 +
        keyword_overlap * 0.15 +
        text_length_score * 0.1 +
        domain_boost * 0.1
    ) - quality_penalties
    
    return max(0.0, min(1.0, final_score))

async def cluster_chunks_semantically(
    chunks: List[models.ContentChunk], 
    content_vector: ContentVector, 
    max_clusters: int = 3
) -> Dict[str, List[models.ContentChunk]]:
    """Group semantically similar chunks to avoid redundancy"""
    
    if len(chunks) <= max_clusters:
        return {f"cluster_{i}": [chunk] for i, chunk in enumerate(chunks)}
    
    all_sub_chunks = []
    chunk_to_sub_chunk_indices = []
    sub_chunk_size = 500

    for chunk in chunks:
        content = chunk.text_content
        if not content:
            chunk_to_sub_chunk_indices.append([])
            continue
        
        start_index = len(all_sub_chunks)
        sub_chunks_for_this_chunk = [content[i:i+sub_chunk_size] for i in range(0, len(content), sub_chunk_size)]
        all_sub_chunks.extend(sub_chunks_for_this_chunk)
        end_index = len(all_sub_chunks)
        chunk_to_sub_chunk_indices.append(list(range(start_index, end_index)))

    if not all_sub_chunks:
        return {f"cluster_{i}": [chunk] for i, chunk in enumerate(chunks)}

    all_sub_embeddings = await content_vector.generate_embeddings(all_sub_chunks)
    
    averaged_embeddings = []
    for indices in chunk_to_sub_chunk_indices:
        if not indices:
            if content_vector.embedding_dim:
                averaged_embeddings.append(np.zeros(content_vector.embedding_dim))
            continue 

        sub_embeddings = [all_sub_embeddings[i] for i in indices]
        averaged_embedding = np.mean(sub_embeddings, axis=0)
        averaged_embeddings.append(averaged_embedding)

    embeddings = averaged_embeddings

    if not embeddings or len(embeddings) != len(chunks):
        clusters = {}
        for chunk in chunks:
            domain = chunk.original_url.split('/')[2] if chunk.original_url and '/' in chunk.original_url else 'unknown'
            cluster_key = f"domain_{domain}"
            if cluster_key not in clusters:
                clusters[cluster_key] = []
            clusters[cluster_key].append(chunk)
        return dict(list(clusters.items())[:max_clusters])
    
    clusters = {}
    used_indices = set()
    
    for i, chunk in enumerate(chunks):
        if i in used_indices or len(clusters) >= max_clusters:
            continue
            
        cluster_key = f"cluster_{len(clusters)}"
        clusters[cluster_key] = [chunk]
        used_indices.add(i)
        
        for j in range(i + 1, len(chunks)):
            if j in used_indices:
                continue
                
            similarity = np.dot(embeddings[i], embeddings[j]) / (
                np.linalg.norm(embeddings[i]) * np.linalg.norm(embeddings[j])
            )
            
            if similarity > 0.85:  # High similarity threshold
                clusters[cluster_key].append(chunks[j])
                used_indices.add(j)
    
    for i, chunk in enumerate(chunks):
        if i not in used_indices and clusters:
            smallest_cluster = min(clusters.keys(), key=lambda k: len(clusters[k]))
            clusters[smallest_cluster].append(chunk)
    
    return clusters

def select_best_from_clusters(
    clustered_chunks: Dict[str, List[models.ContentChunk]], 
    max_chunks: int = 10
) -> List[models.ContentChunk]:
    """Select the best representative from each cluster"""
    
    selected_chunks = []
    
    for cluster_name, cluster_chunks in clustered_chunks.items():
        if not cluster_chunks:
            continue
            
        cluster_chunks.sort(key=lambda x: (
            x.vector_metadata.get("trust_score", 0.5) if x.vector_metadata else 0.5,
            len(x.text_content) if x.text_content else 0
        ), reverse=True)
        
        selected_chunks.append(cluster_chunks[0])
        
        if (len(cluster_chunks) > 1 and 
            len(selected_chunks) < max_chunks and
            cluster_chunks[0].vector_metadata and
            cluster_chunks[0].vector_metadata.get("trust_score", 0) > 0.8):
            selected_chunks.append(cluster_chunks[1])
    
    return selected_chunks[:max_chunks]

def _normalize_url_for_comparison(url: str) -> str:
    """Normalizes a URL for reliable comparison."""
    if not url:
        return ""
    normalized = re.sub(r'^https?:\/\/', '', url)
    normalized = re.sub(r'^(www\.|m\.|mobile\.)', '', normalized)
    if normalized.endswith('/'):
        normalized = normalized[:-1]
    return normalized

def _format_duration_for_finalize(seconds: float) -> str:
    seconds_int = int(seconds)
    if seconds_int < 0: return "0s"
    hours, remainder = divmod(seconds_int, 3600)
    minutes, secs = divmod(remainder, 60)
    if hours > 0: return f"{hours}h {minutes}m {secs}s"
    if minutes > 0: return f"{minutes}m {secs}s"
    return f"{secs}s"

async def initialize_task_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id
    request_params = state.request_params
    api_config = state.api_config
    llm_reasoner: LLMReasoning = services["llm_reasoner"]
    await get_content_vector()  # Initialize singleton; result used by other nodes
    search_scraper: SearchScrape = services["search_scraper"]
    settings: app_config.Settings = services["settings"]

    try:
        detected_language = detect(request_params.initial_query)
    except LangDetectException:
        logger.warning("[%s] Could not detect language for query. Defaulting to 'en'.", task_id)
        detected_language = "en"

    if detected_language != "en" and not settings.DEEP_SEARCH_EMBEDDING_MODEL_IS_MULTILINGUAL:
        processing_language = "en"
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="language_fallback_translation", message=f"Query detected in '{detected_language}'. Translating to English for processing.")))
        translation_result = await llm_reasoner.translate_text_async(
            text_to_translate=request_params.initial_query,
            target_language="English",
            model_info=request_params.reasoning_model_info or {},
            api_config=api_config,
            user_id=state.user_id,
            request_id=f"{task_id}_initial_translate"
        )
        if translation_result.get("translated_text") and not translation_result.get("error"):
            query_in_english = translation_result["translated_text"]
        else:
            logger.error("[%s] Failed to translate initial query to English. Proceeding with original query, but results may be poor.", task_id)
            query_in_english = request_params.initial_query
    elif detected_language != "en":
        processing_language = detected_language
        query_in_english = None
    else:
        processing_language = "en"
        query_in_english = request_params.initial_query


    effective_task_date_context = request_params.task_date_context
    if not effective_task_date_context:
        current_utc_datetime = datetime.now(timezone.utc)
        effective_task_date_context = current_utc_datetime.strftime("%B %d, %Y")

    initial_state_updates: Dict[str, Any] = {
        "task_id": task_id, "original_query": request_params.initial_query,
        "detected_language": detected_language,
        "query_in_english": query_in_english,
        "processing_language": processing_language,
        "request_params": request_params, "api_config": api_config,
        "start_time_monotonic": asyncio.get_event_loop().time(),
        "max_hops": request_params.max_hops or settings.DEFAULT_MAX_HOPS,
        "max_total_urls_per_task": request_params.max_total_urls_per_task or settings.DEEP_SEARCH_MAX_TOTAL_URLS_PER_TASK,
        "max_stagnation_limit": settings.DEFAULT_STAGNATION_LIMIT,
        "current_reasoning_dynamic_temperature": settings.DEEP_SEARCH_REASONING_DEFAULT_TEMP,
        "aggregated_token_usage": [], "current_hop": 0,
        "full_research_plan_data_points": [], "all_reasoning_steps": [],
        "covered_reasoning_steps": set(), "current_queries_for_hop": [],
        "executed_search_queries": set(), "links_to_explore_pq": [], "pq_tie_breaker": 0,
        "stagnation_counter": 0, "is_cancelled_flag": asyncio.Event(),
        "fact_centric_strategy_active": False, "core_entity": None, "target_attributes": [],
        "fact_centric_proposed_attributes": {}, "fact_centric_verified_attributes": {},
        "fact_centric_verification_query_map": {}, "ask_llm_verification_map": {},
        "accumulated_top_chunks_for_synthesis": [], "all_processed_chunks_this_task": {},
        "visited_urls": set(), "site_exploration_depth_tracker": {},
        "permanently_failed_urls_this_task": set(), "search_results_this_hop": [],
        "processed_chunks_this_hop": [], "newly_extracted_links_this_hop": [],
        "document_context_summary": None, "final_report_md": None, "report_sources": [],
        "suggested_follow_ups": [], "pre_flight_llm_answer": None,
        "url_citation_map": {}, "citations_used_map": {},
        "total_urls_scraped_count": 0, "total_chunks_indexed_count": 0,
        "similarity_stop_triggered_this_hop": False, "hops_since_last_temp_increase": 0,
        "significant_progress_after_temp_increase": False, "consecutive_low_diversity_hops": 0,
        "newly_covered_in_hop_check": [],
        "task_date_context": effective_task_date_context, 
        "comptroller_hop_credits": settings.DEEP_SEARCH_COMPTROLLER_INITIAL_CREDITS,
        "force_reexecute_queries_this_hop": set(),
        "comptroller_strategy_re_evaluation_needed": False,
        "claims_previously_fact_checked_in_cycle": set(),
        "previous_librarian_summary": None,
        "consecutive_stagnation_hops": 0
    }
    
    if detected_language != "en" and not settings.DEEP_SEARCH_EMBEDDING_MODEL_IS_MULTILINGUAL and translation_result.get("usage"):
        initial_state_updates["aggregated_token_usage"].append(models.ModelUsageData(
            model_id=request_params.reasoning_model_info.get("id", 0) if request_params.reasoning_model_info else 0,
            model_name=request_params.reasoning_model_info.get("name", "translation_model") if request_params.reasoning_model_info else "translation_model",
            **translation_result["usage"]
        ))

    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="pre_flight_vector_store_ready", message="Vector store ready.")))
    
    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="pre_flight_search_engines_complete", message="Search engine pre-flight checks complete.")))

    pre_flight_llm_answer = None
    if settings.DEEP_SEARCH_ENABLE_PREFLIGHT_LLM_ANSWER:
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="pre_flight_answer_start", message="Gathering available information...")))
        try:
            model_info_preflight = request_params.synthesis_model_info or request_params.reasoning_model_info or {}
            if not model_info_preflight.get('name'): model_info_preflight['name'] = settings.DEFAULT_REASONING_MODEL
            model_info_preflight_call = model_info_preflight.copy()
            model_info_preflight_call['temperature'] = settings.DEEP_SEARCH_PREFLIGHT_LLM_ANSWER_TEMP
            preflight_result = await llm_reasoner.get_holistic_initial_answer(
                original_query=request_params.initial_query, model_info=model_info_preflight_call,
                api_config=api_config, user_id=state.user_id, 
                request_id=f"{task_id}_preflight_answer_graph",
                is_cancelled_flag=initial_state_updates["is_cancelled_flag"])
            if preflight_result.get("usage"):
                initial_state_updates["aggregated_token_usage"].append(models.ModelUsageData(model_id=model_info_preflight_call.get("id", 0), model_name=model_info_preflight_call.get("name"), **preflight_result["usage"]))
            if preflight_result.get("answer") and not preflight_result.get("error"):
                pre_flight_llm_answer = preflight_result["answer"]
                await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="pre_flight_answer_generated", message="Now I have a good overview.")))
            else:
                pass
        except Exception as e_preflight: logging.debug("Suppressed %s: %s", type(e_preflight).__name__, e_preflight)
    initial_state_updates["pre_flight_llm_answer"] = pre_flight_llm_answer
    
    if pre_flight_llm_answer:
        # Generate a concise summary of the pre-flight answer using LLM
        try:
            summary_model_info = request_params.reasoning_model_info or {}
            if not summary_model_info.get('name'): 
                summary_model_info['name'] = settings.DEFAULT_REASONING_MODEL
            summary_model_info['temperature'] = 0.3
            
            summary_result = await llm_reasoner.summarize_chunk_in_isolation(
                chunk_text=f"Generate a 10-word summary of the key concepts: {pre_flight_llm_answer}",
                model_info=summary_model_info,
                api_config=api_config,
                user_id=state.user_id,
                request_id=f"{task_id}_preflight_summary"
            )
            
            if summary_result.get("summary") and not summary_result.get("error"):
                key_aspects = summary_result["summary"].strip()
            else:
                # Fallback to simple extraction
                key_aspects = ', '.join(pre_flight_llm_answer.split('.')[0].split()[:6])
            
            if summary_result.get("usage"):
                initial_state_updates["aggregated_token_usage"].append(models.ModelUsageData(
                    model_id=summary_model_info.get("id", 0), 
                    model_name=summary_model_info.get("name"), 
                    **summary_result["usage"]
                ))
        except Exception:
            # Fallback to simple extraction
            key_aspects = ', '.join(pre_flight_llm_answer.split('.')[0].split()[:6])
        
        # Natural reasoning message for initial LLM response
        initial_reasoning_msg = agent_dialogue.INITIAL_LLM_REASONING.format(
            key_aspects=key_aspects
        )
        
        await output_queue.put(models.SSEEvent(
            task_id=task_id, 
            event_type="progress", 
            payload=models.SSEProgressData(
                stage="initial_reasoning", 
                message=initial_reasoning_msg,
                is_key_summary=True
            )
        ))
        
        await output_queue.put(models.SSEEvent(
            task_id=task_id,
            event_type="pre_flight_answer",
            payload=models.SSEPreFlightAnswerData(
                answer_text=pre_flight_llm_answer,
                message="[Initial Answer]"
            )
        ))

    document_context_summary = None
    if request_params.is_document_focused_query and getattr(request_params, 'document_references', None) and request_params.document_references:
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="doc_context_retrieval_start", message="Loading context from provided documents...")))
        doc_summaries = []
        for doc_ref in request_params.document_references:
            if not doc_ref.file_id: continue
            doc_name_for_log = doc_ref.original_filename or doc_ref.file_id
            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"doc_context_retrieval_{doc_ref.file_id}", message=f"Processing document: {doc_name_for_log}")))
            placeholder_summary = f"Content from document '{doc_name_for_log}' is being considered. (This is a placeholder summary; full content processing would occur here)."
            doc_summaries.append(placeholder_summary)
            simulated_summary_usage = {"prompt_tokens": 200, "completion_tokens": 50, "total_tokens": 250} 
            initial_state_updates["aggregated_token_usage"].append(models.ModelUsageData(model_id=0, model_name="simulated_doc_summary_model", **simulated_summary_usage))
        if doc_summaries:
            document_context_summary = "\n\n".join(doc_summaries)
            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="doc_context_retrieval_complete", message="Document context loaded/summarized.")))
        else:
            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="doc_context_retrieval_nodata", message="No document context could be loaded or summarized.")))
    initial_state_updates["document_context_summary"] = document_context_summary
    
    context_for_decomposition = pre_flight_llm_answer or document_context_summary
    decomposition_model_info = request_params.reasoning_model_info or {}
    if not decomposition_model_info.get("name"): decomposition_model_info["name"] = settings.DEFAULT_REASONING_MODEL
    if settings.DEEP_SEARCH_ENABLE_DYNAMIC_TEMPERATURE and settings.DEEP_SEARCH_INITIAL_DECOMPOSITION_TEMP is not None:
        decomposition_model_info['temperature'] = settings.DEEP_SEARCH_INITIAL_DECOMPOSITION_TEMP
    
    decomposition_result = await llm_reasoner.decompose_initial_query(
        original_query=request_params.initial_query, model_info=decomposition_model_info,
        api_config=api_config, user_id=state.user_id, 
        request_id=f"{task_id}_decompose_graph",
        document_context_summary=context_for_decomposition,
        is_document_focused_query=request_params.is_document_focused_query,
        task_date_context=initial_state_updates["task_date_context"],
        is_cancelled_flag=initial_state_updates["is_cancelled_flag"])
    if decomposition_result.get("usage"):
         initial_state_updates["aggregated_token_usage"].append(models.ModelUsageData(model_id=decomposition_model_info.get("id", 0), model_name=decomposition_model_info.get("name"), **decomposition_result["usage"]))
    if decomposition_result.get("error"): 
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="error", payload=models.SSEErrorData(error_message=f"Failed to generate research plan: {decomposition_result.get('error')}", stage="query_decomposition", is_fatal=True)))
        initial_state_updates["is_cancelled_flag"].set()
        return initial_state_updates

    full_plan = decomposition_result.get("full_plan_output", {})
    raw_data_points = full_plan.get("required_data_points", [])
    for dp in raw_data_points:
        if dp.get("status") == "PROPOSED_FROM_LLM_KNOWLEDGE": dp["verification_status"] = "LLM_PROPOSED_NEEDS_VERIFICATION"
        elif dp.get("status") == "NEEDS_VERIFICATION_WEB": dp["verification_status"] = "PENDING_WEB_VERIFICATION"
        elif dp.get("status") == "EXTRACTED_FROM_SOURCE": dp["verification_status"] = "SOURCE_EXTRACTED_TRUST_UNKNOWN" 
        else: dp["verification_status"] = "NOT_APPLICABLE" 
    initial_state_updates["full_research_plan_data_points"] = raw_data_points
    initial_state_updates["all_reasoning_steps"] = [dp.get("name", "Unnamed") for dp in initial_state_updates["full_research_plan_data_points"]]
    
    initial_queries_for_hop0 = []
    # Placeholder resolution check for initial queries
    for dp in initial_state_updates["full_research_plan_data_points"]:
        retrieval_action = dp.get("retrieval_action")
        # Check if the DP itself has a value or if its dependencies are met for an initial query
        can_run_now = True
        if retrieval_action and "[" in retrieval_action and "]" in retrieval_action: # Contains placeholders
            # Check if all dependent DPs referenced in the placeholder have values
            # This is a simplified check; a more robust one would parse placeholders
            # For now, if it has placeholders, assume it might depend on something not yet available
            # unless its own status is already EXTRACTED_FROM_SOURCE or PROVIDED_BY_SYSTEM
            if dp.get("status") not in ["EXTRACTED_FROM_SOURCE", "PROVIDED_BY_SYSTEM"]:
                 # More detailed check: resolve and see if unresolved markers remain
                resolved_action_for_check_init = llm_reasoner._resolve_placeholders(
                    retrieval_action,
                    initial_state_updates["full_research_plan_data_points"]
                )
                if any(marker in resolved_action_for_check_init for marker in ["[UNRESOLVED_PLACEHOLDER]", "[VALUE_IS_NONE_FOR_", "[UNRESOLVED_DP_ID_", "[UNRESOLVED_ATTRIBUTE_"]):
                    can_run_now = False

        if dp.get("status") in ["NEEDS_RETRIEVAL_WEB", "NEEDS_RETRIEVAL_ENTITY_OVERVIEW", "NEEDS_VERIFICATION_WEB"] and \
           retrieval_action and \
           retrieval_action not in ["NO_SEARCH_NEEDED", "NONE"] and \
           not retrieval_action.startswith("ASK_LLM:") and \
           not retrieval_action.startswith("USER_PROVIDED_CONTEXT_ONLY") and \
           len(retrieval_action.split()) > 1 and can_run_now:
            initial_queries_for_hop0.append(retrieval_action)
        elif dp.get("status") in ["NEEDS_RETRIEVAL_WEB", "NEEDS_RETRIEVAL_ENTITY_OVERVIEW", "NEEDS_VERIFICATION_WEB"] and \
             (not retrieval_action or retrieval_action in ["NO_SEARCH_NEEDED", "NONE"] or retrieval_action.startswith("ASK_LLM:") or len(retrieval_action.split()) <=1 ) and can_run_now: # also check can_run_now here
            pass
        elif not can_run_now and dp.get("status") in ["NEEDS_RETRIEVAL_WEB", "NEEDS_RETRIEVAL_ENTITY_OVERVIEW", "NEEDS_VERIFICATION_WEB"]:
            # This case is already logged above if can_run_now is False due to placeholders
            pass


    initial_state_updates["current_queries_for_hop"] = list(dict.fromkeys(initial_queries_for_hop0))
    
    fact_centric_active = full_plan.get("overall_query_strategy") == "fact_centric"
    # The following block was misindented. It should be at the same level as the fact_centric_active assignment.
    core_entity = full_plan.get("overall_core_entity")
    target_attributes = full_plan.get("overall_target_attributes", [])
    if fact_centric_active and core_entity and target_attributes:
        initial_state_updates.update({"fact_centric_strategy_active": True, "core_entity": core_entity, "target_attributes": target_attributes})
    else: initial_state_updates["fact_centric_strategy_active"] = False

    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="query_decomposition_complete", message="Research plan generated.")))
    return initial_state_updates

async def web_search_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id
    hop_failed_queries: List[str] = []
    hop_successful_queries: List[str] = []
    total_queries_attempted_this_hop: int = 0
    

    current_queries_original_actions = state.current_queries_for_hop 
    api_config = state.api_config
    search_scraper: SearchScrape = services["search_scraper"]
    settings: app_config.Settings = services["settings"]
    llm_reasoner: LLMReasoning = services["llm_reasoner"] 
    links_to_explore_pq_updated = list(state.links_to_explore_pq) 

    
    results_this_node: List[models.SearchResultItem] = []
    executed_this_pass: Set[str] = set() 
    
    async def _cb(pk, cq): 
        await output_queue.put(models.SSEEvent(task_id=task_id,event_type="progress",payload=models.SSEProgressData(stage=f"h{state.current_hop}_search",message=f"Searching for: '{cq[:40]}...'")))
    
    max_res = state.request_params.max_results_per_provider_query or settings.DEFAULT_MAX_RESULTS_PER_PROVIDER_QUERY

    if not current_queries_original_actions and not links_to_explore_pq_updated:
        return_dict = {"search_results_this_hop": [], "executed_search_queries": state.executed_search_queries, "links_to_explore_pq": links_to_explore_pq_updated}
        if state.is_comptroller_review_failed: return_dict["is_comptroller_review_failed"] = False
        return_dict["force_reexecute_queries_this_hop"] = set() 
        return return_dict

    if current_queries_original_actions:
        content_vector = await get_content_vector()
        uncovered_steps = [s for s in state.all_reasoning_steps if s not in state.covered_reasoning_steps]
        
        uncovered_steps_embeddings = await content_vector.generate_embeddings(uncovered_steps)

        for query in current_queries_original_actions[:3]:
            resolved_query = llm_reasoner._resolve_placeholders(query, state.full_research_plan_data_points)
            if not any(marker in resolved_query for marker in ["[UNRESOLVED_PLACEHOLDER]", "[UNRESOLVED_DP_ID_"]):
                
                query_embedding = await content_vector.generate_embeddings([resolved_query])
                
                if query_embedding and query_embedding[0] is not None and uncovered_steps_embeddings:
                    query_embedding_np = np.array(query_embedding[0])
                    uncovered_steps_embeddings_np = np.array(uncovered_steps_embeddings)
                    similarities = np.dot(uncovered_steps_embeddings_np, query_embedding_np.T)
                    best_match_index = np.argmax(similarities)
                    highest_similarity_aspect = uncovered_steps[best_match_index]
                    why_explanation = f"this relates to the '{highest_similarity_aspect}' aspect of your question"
                else:
                    why_explanation = "it is relevant to the research goals."

                search_reasoning_msg = agent_dialogue.SEARCH_REASONING_WITH_WHY.format(
                    search_topic=resolved_query,
                    why_explanation=why_explanation
                )
                
                await output_queue.put(models.SSEEvent(
                    task_id=task_id, 
                    event_type="progress", 
                    payload=models.SSEProgressData(
                        stage="search_reasoning", 
                        message=search_reasoning_msg,
                        is_key_summary=True
                    )
                ))

        for query_action_original in current_queries_original_actions:
            if state.is_cancelled_flag.is_set():
                break
            
            query_str_resolved = llm_reasoner._resolve_placeholders(
                query_action_original, state.full_research_plan_data_points, 
                max_depth=settings.DEEP_SEARCH_PLACEHOLDER_RESOLUTION_DEPTH
            )

            if any(marker in query_str_resolved for marker in ["[UNRESOLVED_PLACEHOLDER]", "[UNRESOLVED_DP_ID_", "[VALUE_IS_NONE_FOR_", "[UNRESOLVED_ATTRIBUTE_"]):
                hop_failed_queries.append(query_action_original) 
                executed_this_pass.add(query_str_resolved) 
                continue
            
            temp_query_for_check = query_str_resolved.lower()
            if "search for 'key provisions of " in temp_query_for_check: 
                payload_part = temp_query_for_check.split("search for 'key provisions of ", 1)[-1].strip("' ")
                if len(payload_part.split()) <= 1 and payload_part in ["none", "null", "''", '""']: 
                    hop_failed_queries.append(query_action_original) 
                    executed_this_pass.add(query_str_resolved) 
                    continue
            
            is_forced_comptroller_query = query_str_resolved in getattr(state, "force_reexecute_queries_this_hop", set())

            if query_str_resolved.startswith("ASK_LLM:") or query_str_resolved == "NO_SEARCH_NEEDED":
                executed_this_pass.add(query_str_resolved)
                continue

            if not is_forced_comptroller_query and query_str_resolved in state.executed_search_queries:
                executed_this_pass.add(query_str_resolved)
                continue
            
            if is_forced_comptroller_query:
                pass
            
            data_point_for_query = next((dp for dp in state.full_research_plan_data_points if dp.get("retrieval_action") == query_action_original), None)
            pref_type = data_point_for_query.get("preferred_provider_type") if data_point_for_query else None
            
            query_to_use_for_search = query_str_resolved
            providers_for_this_search_pass = list(state.request_params.search_providers or settings.SEARCH_PROVIDERS_DEFAULT)

            if pref_type == "courtlistener":
                model_info_simplify = state.request_params.reasoning_model_info or {}
                # This entire block of old simplification logic is replaced by the new comprehensive block above.
            
            total_queries_attempted_this_hop += 1
            s_list, errors = await search_scraper.execute_search_pass(
                query=query_to_use_for_search, 
                search_providers=providers_for_this_search_pass, 
                api_config=api_config, 
                max_results_per_query=max_res, 
                progress_callback=_cb,
                is_fact_checking_pass=False, 
                is_cancelled_flag=state.is_cancelled_flag 
            )

            if not s_list and len(errors) >= len(providers_for_this_search_pass):
                hop_failed_queries.append(query_to_use_for_search)
            elif s_list:
                hop_successful_queries.append(query_to_use_for_search)

            for item_dict in s_list:
                if item_dict.get('url') and isinstance(item_dict.get('url'), str) and item_dict.get('url').strip():
                    try: results_this_node.append(models.SearchResultItem(**item_dict))
                    except Exception as e_model: logging.debug("Suppressed %s: %s", type(e_model).__name__, e_model)
                else: pass

            for p, e in errors.items(): 
                await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"web_search_provider_error_{p}", message=f"Warning: Provider {p} error: {e}")))
            executed_this_pass.add(query_str_resolved) 

    num_links_to_process_this_hop = settings.MAX_LINKS_FROM_PQ_PER_HOP
    should_explore_links = (not results_this_node or len(results_this_node) < (settings.DEEP_SEARCH_URLS_PER_HOP_SUBSEQUENT // 2)) and links_to_explore_pq_updated

    if should_explore_links:
        links_processed_count = 0
        while links_to_explore_pq_updated and links_processed_count < num_links_to_process_this_hop:
            if state.is_cancelled_flag.is_set():
                break
            try:
                neg_priority, tie_breaker, link_candidate = heapq.heappop(links_to_explore_pq_updated)
                if link_candidate.url in state.visited_urls or link_candidate.url in state.permanently_failed_urls_this_task:
                    continue
                link_as_search_result = models.SearchResultItem(url=link_candidate.url, title=link_candidate.anchor_text or f"Linked from {link_candidate.source_page_url}", snippet=link_candidate.context_around_link or f"Exploring link from {link_candidate.source_page_url}", provider_name="internal_link_explorer", query_phrase_used=f"link_from:{link_candidate.source_page_url}", position=0)
                results_this_node.append(link_as_search_result)
                links_processed_count += 1
                await output_queue.put(models.SSEEvent(task_id=task_id,event_type="progress",payload=models.SSEProgressData(stage=f"h{state.current_hop}_link_selected",message=f"Exploring link: {link_candidate.url[:50]}...")))
            except IndexError: break 
            except Exception as e_pq: continue
        
    updated_executed_queries = state.executed_search_queries.copy()
    updated_executed_queries.update(executed_this_pass)
    
    await output_queue.put(models.SSEEvent(task_id=task_id,event_type="progress",payload=models.SSEProgressData(stage=f"h{state.current_hop}_search_done", message=f"Web search/link selection phase complete. Found/selected {len(results_this_node)} items for processing.")))
    
    if total_queries_attempted_this_hop > 0:
        failure_rate_this_hop = len(hop_failed_queries) / total_queries_attempted_this_hop
        if failure_rate_this_hop > settings.DEEP_SEARCH_HIGH_FAILURE_RATE_THRESHOLD:
            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"h{state.current_hop}_high_search_failure_rate", message=f"Warning: High search failure rate ({failure_rate_this_hop:.2%}) encountered.")))

    updated_failed_search_queries = list(state.failed_search_queries) + hop_failed_queries
    updated_successful_search_queries = list(state.successful_search_queries) + hop_successful_queries

    return_dict = {
        "search_results_this_hop": results_this_node, 
        "executed_search_queries": updated_executed_queries, 
        "links_to_explore_pq": links_to_explore_pq_updated, 
        "failed_search_queries": updated_failed_search_queries, 
        "successful_search_queries": updated_successful_search_queries,
        "force_reexecute_queries_this_hop": set() 
    }
    if state.is_comptroller_review_failed: 
        return_dict["is_comptroller_review_failed"] = False 
    return return_dict

async def process_content_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id
    search_results: List[models.SearchResultItem] = state.search_results_this_hop
    search_scraper: SearchScrape = services["search_scraper"]
    content_vector = await get_content_vector()
    settings: app_config.Settings = services["settings"]

    if not search_results:
        return {
            "processed_chunks_this_hop": [], 
            "newly_extracted_links_this_hop": [],
            "all_processed_chunks_this_task": state.all_processed_chunks_this_task,
            "visited_urls": state.visited_urls,
            "permanently_failed_urls_this_task": state.permanently_failed_urls_this_task,
            "site_exploration_depth_tracker": state.site_exploration_depth_tracker,
            "page_link_details_map": state.page_link_details_map, 
            "total_chunks_indexed_count": state.total_chunks_indexed_count,
            "total_urls_scraped_count": state.total_urls_scraped_count
        }


    processed_chunks_for_node: List[models.ContentChunk] = []
    newly_extracted_links_for_node: List[models.CandidateLinkToExplore] = []
    
    visited_urls_updated = state.visited_urls.copy()
    permanently_failed_urls_updated = state.permanently_failed_urls_this_task.copy()
    site_exploration_depth_tracker_updated = state.site_exploration_depth_tracker.copy()
    all_processed_chunks_this_task_updated = state.all_processed_chunks_this_task.copy()
    total_chunks_indexed_count_updated = state.total_chunks_indexed_count
    total_urls_scraped_count_updated = state.total_urls_scraped_count
    page_link_details_map_updated = state.page_link_details_map.copy() 
    
    unique_search_results_map: Dict[str, models.SearchResultItem] = {}
    for sr in search_results:
        if sr.url and sr.url not in unique_search_results_map:
            unique_search_results_map[sr.url] = sr
    
    
    urls_to_process_this_pass: List[str] = []
    for url, sr_item in unique_search_results_map.items():
        if url in visited_urls_updated or url in permanently_failed_urls_updated: continue
        domain = search_scraper._get_domain_from_url(url)
        site_key = search_scraper._extract_registered_domain(domain) if domain else url
        current_site_depth = site_exploration_depth_tracker_updated.get(site_key, 0)
        max_depth_this_site = state.request_params.max_url_exploration_depth or settings.DEFAULT_MAX_URL_EXPLORATION_DEPTH
        if current_site_depth >= max_depth_this_site: continue
        if total_urls_scraped_count_updated + len(urls_to_process_this_pass) >= state.max_total_urls_per_task: break
        urls_to_process_this_pass.append(url)

    scrape_tasks = []
    urls_being_scraped = []
    # Create tasks for all URLs to be processed, respecting the concurrency limit
    for url_to_scrape in urls_to_process_this_pass:
        search_result_item = unique_search_results_map[url_to_scrape]
        original_source_info_for_scrape = {"title": search_result_item.title, "snippet": search_result_item.snippet, "provider": search_result_item.provider_name, "source_query": search_result_item.query_phrase_used, "task_id": task_id}
        
        # Fire and forget the task creation
        task = asyncio.create_task(search_scraper.scrape_url_with_vetting_enhanced(url=url_to_scrape, original_source_info=original_source_info_for_scrape, is_cancelled_flag=state.is_cancelled_flag))
        scrape_tasks.append(task)
        urls_being_scraped.append(url_to_scrape)
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"h{state.current_hop}_scraping_{url_to_scrape[:30]}", message=f"Reading {url_to_scrape}")))

    # Gather results from all scraping tasks
    scrape_results_outputs = await asyncio.gather(*scrape_tasks, return_exceptions=True)
    docs_to_add_to_vector_store: List[models.GenericDocumentItem] = []

    for i, scrape_result_item_or_exc in enumerate(scrape_results_outputs):
        if state.is_cancelled_flag.is_set():
            break
        url = urls_being_scraped[i]; search_result_item = unique_search_results_map[url]
        visited_urls_updated.add(url); domain = search_scraper._get_domain_from_url(url)
        site_key = search_scraper._extract_registered_domain(domain) if domain else url
        site_exploration_depth_tracker_updated[site_key] = site_exploration_depth_tracker_updated.get(site_key, 0) + 1

        if isinstance(scrape_result_item_or_exc, Exception):
            if search_scraper.academic_handler.is_academic_site(url):
                site_info = search_scraper.academic_handler.get_site_info(url) or {}
                scrape_output = search_scraper.academic_handler._create_snippet_based_result(url, search_result_item.snippet or "N/A", search_result_item.title or "N/A", site_info)
                if "error" in scrape_output: scrape_output["error"] = None
            else: permanently_failed_urls_updated.add(url); continue
        else: scrape_output = scrape_result_item_or_exc

        if scrape_output.get("error") and not scrape_output.get("content"):
            if not (search_scraper.academic_handler.is_academic_site(url) and "content" in scrape_output and scrape_output["content"]):
                permanently_failed_urls_updated.add(url); continue
        if not scrape_output.get("content"): permanently_failed_urls_updated.add(url); continue
        
        total_urls_scraped_count_updated += 1
        content_text = scrape_output.get("content")
        
        page_title = (
            scrape_output.get("title") or 
            scrape_output.get("metadata", {}).get("title") or 
            search_result_item.title or
            f"Content from {search_scraper._get_domain_from_url(url) or 'unknown'}"
        )
        if not page_title or page_title.strip() == "":
            domain = search_scraper._get_domain_from_url(url)
            page_title = f"Content from {domain}" if domain else "Web Source"

        chunk_texts = await content_vector.chunk_text(text=content_text, chunk_size=state.request_params.chunk_size_words or settings.DEFAULT_CHUNK_SIZE_WORDS, chunk_overlap=state.request_params.chunk_overlap_words or settings.DEFAULT_CHUNK_OVERLAP_WORDS)
        for idx, chunk_text_content in enumerate(chunk_texts):
            if state.is_cancelled_flag.is_set():
                break
            chunk_id = str(uuid.uuid4())
            current_domain = search_scraper._get_domain_from_url(url) if url else None
            chunk_metadata = {
                "original_url": url, 
                "page_title": page_title, 
                "chunk_index_in_page": idx, 
                "depth": state.current_hop, 
                "content_preview": chunk_text_content[:200], 
                "trust_score": scrape_output.get("source_info", {}).get("trust_score", 0.5), 
                "is_pdf": scrape_output.get("source_info", {}).get("is_pdf", False), 
                "source_search_query": search_result_item.query_phrase_used, 
                "retrieved_at": datetime.now(timezone.utc).isoformat(timespec='seconds'),
                "provider_name": search_result_item.provider_name, # Added search provider
                "domain": current_domain # Added domain
            }
            chunk_obj = models.ContentChunk(chunk_id=chunk_id, original_url=url, page_title=page_title, text_content=chunk_text_content, chunk_index_in_page=idx, depth=state.current_hop, vector_metadata=chunk_metadata)
            processed_chunks_for_node.append(chunk_obj); all_processed_chunks_this_task_updated[chunk_id] = chunk_obj
            docs_to_add_to_vector_store.append(models.GenericDocumentItem(id=chunk_id, text_content=chunk_text_content, metadata=chunk_metadata))
        
        extracted_link_items: List[models.ExtractedLinkItem] = scrape_output.get("links", [])
        if extracted_link_items:
            page_link_details_map_updated[url] = extracted_link_items
        for link_item in extracted_link_items:
            if state.is_cancelled_flag.is_set():
                break
            newly_extracted_links_for_node.append(models.CandidateLinkToExplore(url=link_item.url, source_page_url=url, calculated_depth=state.current_hop, anchor_text=link_item.anchor_text, context_around_link=link_item.context_around_link))

    if docs_to_add_to_vector_store:
        try:
            await content_vector.add_documents(group_id=task_id, documents=docs_to_add_to_vector_store)
            total_chunks_indexed_count_updated += len(docs_to_add_to_vector_store)
            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"h{state.current_hop}_content_indexed", message=f"Indexed {len(docs_to_add_to_vector_store)} new chunks.")))
        except Exception as e_index:
            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"h{state.current_hop}_indexing_error", message=f"Error indexing content: {str(e_index)}.")))

    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"hop_{state.current_hop}_content_processing_complete", message=f"Content processing complete. {total_urls_scraped_count_updated - state.total_urls_scraped_count} URLs newly scraped, {len(processed_chunks_for_node)} new chunks processed.")))
    return {"processed_chunks_this_hop": processed_chunks_for_node, "newly_extracted_links_this_hop": newly_extracted_links_for_node, "all_processed_chunks_this_task": all_processed_chunks_this_task_updated, "visited_urls": visited_urls_updated, "permanently_failed_urls_this_task": permanently_failed_urls_updated, "site_exploration_depth_tracker": site_exploration_depth_tracker_updated, "page_link_details_map": page_link_details_map_updated, "total_chunks_indexed_count": total_chunks_indexed_count_updated, "total_urls_scraped_count": total_urls_scraped_count_updated}

async def analyze_content_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id; processed_chunks_this_hop: List[models.ContentChunk] = state.processed_chunks_this_hop
    llm_reasoner: LLMReasoning = services["llm_reasoner"]; content_vector = await get_content_vector()
    settings: app_config.Settings = services["settings"]; current_aggregated_tokens = list(state.aggregated_token_usage)
    similarity_stop_triggered_this_hop_updated = False; consecutive_low_diversity_hops_updated = state.consecutive_low_diversity_hops
    # Natural reasoning message for analysis phase
    uncovered_topics = [step for step in state.all_reasoning_steps if step not in state.covered_reasoning_steps]
    analysis_reasoning_msg = agent_dialogue.CONTENT_ANALYSIS_REASONING.format(
        findings_summary=f"content from {len(state.all_processed_chunks_this_task)} sources"
    )
    
    await output_queue.put(models.SSEEvent(
        task_id=task_id, 
        event_type="progress", 
        payload=models.SSEProgressData(
            stage="analysis_reasoning", 
            message=analysis_reasoning_msg,
            is_key_summary=True
        )
    ))

    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"h{state.current_hop}_analyze_start", message=agent_dialogue.LIBRARIAN_ANALYSIS_START.format(research_focus=', '.join(uncovered_topics[:2]) if uncovered_topics else 'your research objectives'))))
    query_parts = [state.original_query] + state.all_reasoning_steps; vector_query_text = " ".join(list(set(query_parts)))
    
    # Enhanced multi-query vector search with quality filtering
    vector_queries = [state.original_query] # Start with the original query for vector search context
    reasoning_model_for_analysis = state.request_params.reasoning_model_info or {};
    if not reasoning_model_for_analysis.get("name"): reasoning_model_for_analysis["name"] = settings.DEFAULT_REASONING_MODEL
    top_k_for_this_hop = state.request_params.top_k_retrieval_per_hop or settings.DEFAULT_TOP_K_RETRIEVAL_PER_HOP
    
    # Add HyDE query if enabled
    if settings.DEEP_SEARCH_ENABLE_HYDE:
        hyde_query_input = state.original_query
        hyde_result = await llm_reasoner.generate_hypothetical_document(
            query=hyde_query_input,
            model_info=reasoning_model_for_analysis,
            api_config=state.api_config,
            user_id=state.user_id,
            request_id=f"{task_id}_hyde_h{state.current_hop}",
            is_cancelled_flag=state.is_cancelled_flag
        )
        if hyde_result.get("hypothetical_document") and not hyde_result.get("error"):
            vector_queries.append(hyde_result["hypothetical_document"])
            if hyde_result.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=reasoning_model_for_analysis.get("id",0),model_name=reasoning_model_for_analysis.get("name"),**hyde_result["usage"]))
        elif hyde_result.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=reasoning_model_for_analysis.get("id",0),model_name=reasoning_model_for_analysis.get("name"),**hyde_result["usage"]))

    # BATCHED multi-query vector search
    all_vector_results = []
    groups_to_search_hop = [task_id]
    if settings.DEEP_SEARCH_GLOBAL_VECTOR_STORE_GROUP_ID and settings.DEEP_SEARCH_GLOBAL_VECTOR_STORE_GROUP_ID != task_id:
        groups_to_search_hop.append(settings.DEEP_SEARCH_GLOBAL_VECTOR_STORE_GROUP_ID)

    query_embeddings = await content_vector.generate_embeddings_batch(vector_queries)
    
    for group_id_search in groups_to_search_hop:
        batch_search_results = await content_vector.search_vectors_batch(
            query_vectors=[emb for emb in query_embeddings if emb],
            limit=top_k_for_this_hop * 2,
            group_id=group_id_search
        )
        # Flatten the list of lists into a single list of results
        for result_list in batch_search_results:
            all_vector_results.extend(result_list)
    
    # Deduplicate and apply quality scoring
    unique_results = {}
    for result in all_vector_results:
        if result.id not in unique_results:
            unique_results[result.id] = result
        else:
            # Merge scores (take the higher similarity)
            if result.similarity > unique_results[result.id].similarity:
                unique_results[result.id] = result
    
    # Apply enhanced quality scoring
    quality_scored_chunks = []
    for result in unique_results.values():
        chunk_obj = state.all_processed_chunks_this_task.get(result.id)
        if chunk_obj:
            quality_score = calculate_enhanced_quality_score(
                chunk=chunk_obj, 
                vector_similarity=result.similarity,
                query_keywords=set(re.findall(r'\b\w+\b', vector_query_text.lower()))
            )
            quality_scored_chunks.append((chunk_obj, quality_score))
    
    # Sort by quality and take top candidates
    quality_scored_chunks.sort(key=lambda x: x[1], reverse=True)
    high_quality_chunks = [chunk for chunk, score in quality_scored_chunks[:top_k_for_this_hop]]
    
    # Semantic clustering to reduce redundancy
    if len(high_quality_chunks) > 5:
        clustered_chunks = await cluster_chunks_semantically(
            high_quality_chunks, content_vector, max_clusters=3
        )
        final_chunks = select_best_from_clusters(clustered_chunks, max_chunks=top_k_for_this_hop)
    else:
        final_chunks = high_quality_chunks
    
    # Pre-rerank filtering layer
    pre_rerank_filtered_chunks = []
    query_keywords = set(re.findall(r'\b\w+\b', vector_query_text.lower()))
    boilerplate_phrases = ["at a glance", "welcome to our site", "frequently asked questions"]
    
    for chunk in final_chunks:
        # Keyword/entity match
        chunk_keywords = set(re.findall(r'\b\w+\b', chunk.text_content.lower()))
        if len(query_keywords.intersection(chunk_keywords)) / len(query_keywords) < 0.01:
            continue
            
        # Boilerplate check
        if any(phrase in chunk.text_content.lower() for phrase in boilerplate_phrases):
            continue
            
        pre_rerank_filtered_chunks.append(chunk)

    # Chunk compression via headless summarization
    summarized_chunks = []
    for chunk in pre_rerank_filtered_chunks:
        summary_result = await llm_reasoner.summarize_chunk_in_isolation(
            chunk_text=chunk.text_content,
            model_info=reasoning_model_for_analysis,
            api_config=state.api_config,
            user_id=state.user_id,
            request_id=f"{task_id}_headless_summary_h{state.current_hop}"
        )
        if summary_result.get("summary"):
            summarized_chunk = chunk.copy()
            summarized_chunk.text_content = summary_result["summary"]
            summarized_chunks.append(summarized_chunk)
        else:
            summarized_chunks.append(chunk) # Fallback to original chunk if summarization fails

    chunks_for_librarian_llm = summarized_chunks

    if state.processing_language != 'en':
        english_chunks_to_translate = []
        chunk_indices_to_translate = []
        
        for i, chunk in enumerate(chunks_for_librarian_llm):
            try:
                chunk_lang = detect(chunk.text_content)
                if chunk_lang == 'en':
                    english_chunks_to_translate.append(chunk.text_content)
                    chunk_indices_to_translate.append(i)
            except LangDetectException:
                logging.debug("Suppressed exception")
        if english_chunks_to_translate:
            batch_translation_result = await llm_reasoner.translate_texts_batch_async(
                texts_to_translate=english_chunks_to_translate,
                target_language=state.processing_language,
                model_info=state.request_params.reasoning_model_info or {},
                api_config=state.api_config,
                user_id=state.user_id,
                request_id=f"{task_id}_batch_translate_chunks",
                is_cancelled_flag=state.is_cancelled_flag
            )
            
            if batch_translation_result.get("translated_texts") and not batch_translation_result.get("error"):
                translated_texts = batch_translation_result["translated_texts"]
                for idx, translated_text in enumerate(translated_texts):
                    if idx < len(chunk_indices_to_translate) and translated_text:
                        chunk_index = chunk_indices_to_translate[idx]
                        chunks_for_librarian_llm[chunk_index].text_content = translated_text
                
                if batch_translation_result.get("usage"):
                    current_aggregated_tokens.append(models.ModelUsageData(
                        model_id=state.request_params.reasoning_model_info.get("id", 0) if state.request_params.reasoning_model_info else 0,
                        model_name=state.request_params.reasoning_model_info.get("name", "batch_translation_model") if state.request_params.reasoning_model_info else "batch_translation_model",
                        **batch_translation_result["usage"]
                    ))
            else:
                logger.warning("[%s] Batch translation failed, falling back to individual translations. Error: %s", task_id, batch_translation_result.get('error'))
                for i in chunk_indices_to_translate:
                    chunk = chunks_for_librarian_llm[i]
                    try:
                        translation_result = await llm_reasoner.translate_text_async(
                            text_to_translate=chunk.text_content,
                            target_language=state.processing_language,
                            model_info=state.request_params.reasoning_model_info or {},
                            api_config=state.api_config,
                            user_id=state.user_id,
                            request_id=f"{task_id}_fallback_translate_chunk_{chunk.chunk_id}"
                        )
                        if translation_result.get("translated_text"):
                            chunk.text_content = translation_result["translated_text"]
                    except Exception as e_fallback:
                        logger.warning("[%s] Individual translation fallback failed for chunk %s: %s", task_id, chunk.chunk_id, e_fallback)

    top_chunks_summary_for_sse: List[models.ChunkSummary] = [] 
    for chunk_obj_hop in chunks_for_librarian_llm: 
         top_chunks_summary_for_sse.append(models.ChunkSummary(chunk_id=chunk_obj_hop.chunk_id, source_url=chunk_obj_hop.original_url, title=chunk_obj_hop.page_title, brief_snippet=chunk_obj_hop.text_content[:100], relevance_score=0.9, depth=chunk_obj_hop.depth))
    updated_accumulated_chunks = list(state.accumulated_top_chunks_for_synthesis)
    for chunk_to_add in chunks_for_librarian_llm:
        if chunk_to_add.chunk_id not in [c.chunk_id for c in updated_accumulated_chunks]:
            updated_accumulated_chunks.append(chunk_to_add)
            if chunk_to_add.chunk_id not in state.all_processed_chunks_this_task: state.all_processed_chunks_this_task[chunk_to_add.chunk_id] = chunk_to_add
    query_phrase_being_verified_for_librarian: Optional[str] = None; proposed_fact_to_verify_for_librarian: Optional[Tuple[str,str]] = None
    if chunks_for_librarian_llm:
        first_chunk_source_query = chunks_for_librarian_llm[0].vector_metadata.get("source_search_query")
        if first_chunk_source_query and first_chunk_source_query in state.ask_llm_verification_map:
            query_phrase_being_verified_for_librarian = first_chunk_source_query
            verification_details = state.ask_llm_verification_map[first_chunk_source_query]
            proposed_fact_to_verify_for_librarian = (verification_details.get("original_question"), verification_details.get("proposed_answer"))
    librarian_response_dict = await llm_reasoner.perform_librarian_check(
        reasoning_steps_to_cover=[rs for rs in state.all_reasoning_steps if rs not in state.covered_reasoning_steps], 
        retrieved_chunks_text=[chunk.text_content for chunk in chunks_for_librarian_llm], 
        model_info=reasoning_model_for_analysis, 
        api_config=state.api_config, 
        user_id=state.user_id, 
        request_id=f"{task_id}_h{state.current_hop}_librarian", 
        proposed_fact_to_verify=proposed_fact_to_verify_for_librarian, 
        query_phrase_being_verified=query_phrase_being_verified_for_librarian, 
        task_date_context=state.task_date_context,
        is_cancelled_flag=state.is_cancelled_flag
    )
    if librarian_response_dict.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=reasoning_model_for_analysis.get("id",0), model_name=reasoning_model_for_analysis.get("name"), **librarian_response_dict["usage"]))
    analysis_result_model: Optional[models.LibrarianAnalysisResult] = librarian_response_dict.get("analysis")
    updated_covered_steps = state.covered_reasoning_steps.copy()
    newly_covered_in_hop_check: List[str] = []
    
    # Stagnation detection logic
    current_librarian_summary = analysis_result_model.remaining_gaps_summary if analysis_result_model else ""
    if current_librarian_summary and current_librarian_summary == state.previous_librarian_summary:
        consecutive_stagnation_hops_updated = state.consecutive_stagnation_hops + 1
    else:
        consecutive_stagnation_hops_updated = 0

    full_research_plan_data_points_updated_after_librarian = [dp.copy() for dp in state.full_research_plan_data_points]

    if analysis_result_model:
        if analysis_result_model.verified_query_phrase_if_any and \
           analysis_result_model.verification_outcome != "NOT_APPLICABLE" and \
           analysis_result_model.verified_query_phrase_if_any in state.ask_llm_verification_map:
            
            verification_details = state.ask_llm_verification_map[analysis_result_model.verified_query_phrase_if_any]
            original_dp_name = verification_details.get("original_dp_name")
            proposed_answer_by_llm = verification_details.get("proposed_answer")

            for dp in full_research_plan_data_points_updated_after_librarian:
                if dp.get("name") == original_dp_name:
                    if analysis_result_model.verification_outcome == "CONFIRMED":
                        dp["value"] = analysis_result_model.confirmed_value or proposed_answer_by_llm 
                        dp["status"] = "RESOLVED_BY_WEB_VERIFICATION"
                        dp["verification_status"] = "WEB_VERIFIED_CONFIRMED"
                        dp["resolution_details"] = f"LLM proposed answer '{proposed_answer_by_llm}' confirmed by web search. Confirmed value: '{dp['value']}'."
                        if original_dp_name not in updated_covered_steps: updated_covered_steps.add(original_dp_name); newly_covered_in_hop_check.append(original_dp_name)
                    elif analysis_result_model.verification_outcome == "CONTRADICTED":
                        dp["status"] = "FAILED_VERIFICATION_CONTRADICTION"
                        dp["verification_status"] = "WEB_VERIFIED_CONTRADICTED"
                        dp["resolution_details"] = f"LLM proposed answer '{proposed_answer_by_llm}' contradicted by web search."
                    elif analysis_result_model.verification_outcome == "INCONCLUSIVE":
                        dp["status"] = "FAILED_VERIFICATION_INCONCLUSIVE"
                        dp["verification_status"] = "WEB_VERIFICATION_INCONCLUSIVE"
                        dp["resolution_details"] = f"Web verification for LLM proposed answer '{proposed_answer_by_llm}' was inconclusive."
                    break
        
        if analysis_result_model.covered_reasoning_steps and isinstance(analysis_result_model.covered_reasoning_steps, list):
            key_info_map = analysis_result_model.key_information_for_covered_steps or {}
            for step_name_from_librarian in analysis_result_model.covered_reasoning_steps:
                if not isinstance(step_name_from_librarian, str):
                    logger.warning("[%s] Skipping non-string step name in covered_reasoning_steps: %s", task_id, step_name_from_librarian)
                    continue

                value_found_by_librarian = key_info_map.get(step_name_from_librarian)

                if value_found_by_librarian is None: 
                    pass 

                if value_found_by_librarian: 
                    for dp in full_research_plan_data_points_updated_after_librarian:
                        if dp.get("name") and (step_name_from_librarian in dp["name"] or dp["name"] in step_name_from_librarian):
                            if dp.get("status") not in ["RESOLVED_BY_WEB_VERIFICATION", "RESOLVED_BY_LLM", "EXTRACTED_FROM_SOURCE"]: 
                                dp["value"] = value_found_by_librarian
                                dp["status"] = "RESOLVED_BY_LIBRARIAN_ANALYSIS" 
                                dp["verification_status"] = "INFORMATION_EXTRACTED_BY_LIBRARIAN"
                                dp["resolution_details"] = f"Information extracted by librarian analysis: {str(value_found_by_librarian)[:200]}"
                                if dp["name"] not in updated_covered_steps: updated_covered_steps.add(dp["name"]); newly_covered_in_hop_check.append(dp["name"])
                            break 
        
    summary_of_findings_hop = "some new insights"; gaps_or_next_steps_hop = "further investigation" 
    if analysis_result_model:
        if analysis_result_model.newly_identified_keywords_or_entities: summary_of_findings_hop = f"these key areas: {', '.join(analysis_result_model.newly_identified_keywords_or_entities[:3])}"
        elif newly_covered_in_hop_check: summary_of_findings_hop = f"aspects of: {', '.join(newly_covered_in_hop_check[:2])}"
        elif analysis_result_model.covered_reasoning_steps and isinstance(analysis_result_model.covered_reasoning_steps, list) and analysis_result_model.covered_reasoning_steps:
             first_step_name = analysis_result_model.covered_reasoning_steps[0]
             if isinstance(first_step_name, str):
                 summary_of_findings_hop = f"aspects of: {first_step_name}"


        if analysis_result_model.remaining_gaps_summary: gaps_or_next_steps_hop = analysis_result_model.remaining_gaps_summary
        elif analysis_result_model.suggested_new_sub_queries: gaps_or_next_steps_hop = f"exploring: {', '.join(analysis_result_model.suggested_new_sub_queries[:2])}"

    enhanced_librarian_message_hop = agent_dialogue.LIBRARIAN_ANALYSIS_COMPLETE_HOP.format(current_hop=state.current_hop, summary_of_findings=summary_of_findings_hop, gaps_or_next_steps=gaps_or_next_steps_hop)
    
    multihop_progress_data_instance = models.MultiHopProgressData(
        current_hop=state.current_hop, 
        max_hops=state.max_hops, 
        hop_stage_name=f"LibrarianAnalysisComplete_Hop{state.current_hop}", 
        hop_stage_message=enhanced_librarian_message_hop, 
        initial_reasoning_steps=state.all_reasoning_steps, 
        covered_reasoning_steps=list(updated_covered_steps), 
        uncovered_reasoning_steps=[s for s in state.all_reasoning_steps if s not in updated_covered_steps], 
        newly_covered_this_hop=newly_covered_in_hop_check, 
        top_chunks_summary=top_chunks_summary_for_sse
    )
    await output_queue.put(models.SSEEvent(
        task_id=task_id, 
        event_type="progress", 
        payload=models.SSEProgressData(
            stage=f"h{state.current_hop}_analyze_done", 
            message=enhanced_librarian_message_hop, 
            details=multihop_progress_data_instance.model_dump(exclude_none=True), # Use .model_dump()
            is_key_summary=True # Flag this as a key summary
        )
    ))
    
    return {
        "librarian_analysis_result": analysis_result_model, 
        "covered_reasoning_steps": updated_covered_steps, 
        "accumulated_top_chunks_for_synthesis": updated_accumulated_chunks, 
        "aggregated_token_usage": current_aggregated_tokens, 
        "newly_covered_in_hop_check": newly_covered_in_hop_check, 
        "similarity_stop_triggered_this_hop": similarity_stop_triggered_this_hop_updated, 
        "consecutive_low_diversity_hops": consecutive_low_diversity_hops_updated,
        "full_research_plan_data_points": full_research_plan_data_points_updated_after_librarian,
        "previous_librarian_summary": current_librarian_summary,
        "consecutive_stagnation_hops": consecutive_stagnation_hops_updated
    }

async def extract_links_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id
    newly_extracted_links: List[models.CandidateLinkToExplore] = state.newly_extracted_links_this_hop
    llm_reasoner: LLMReasoning = services["llm_reasoner"]
    settings: app_config.Settings = services["settings"]
    content_vector = await get_content_vector()
    current_aggregated_tokens = list(state.aggregated_token_usage)

    if not newly_extracted_links:
        return {"links_to_explore_pq": state.links_to_explore_pq, "pq_tie_breaker": state.pq_tie_breaker, "aggregated_token_usage": current_aggregated_tokens}

    valid_new_links = [link for link in newly_extracted_links if link.url not in state.visited_urls and link.url not in state.permanently_failed_urls_this_task]
    if not valid_new_links:
        return {"links_to_explore_pq": state.links_to_explore_pq, "pq_tie_breaker": state.pq_tie_breaker, "aggregated_token_usage": current_aggregated_tokens}

    links_for_llm_selection = valid_new_links
    pre_filter_threshold = getattr(settings, 'DEEP_SEARCH_LINK_SELECTION_PRE_FILTER_THRESHOLD', 100)

    if len(valid_new_links) > pre_filter_threshold:
        uncovered_steps = [s for s in state.all_reasoning_steps if s not in state.covered_reasoning_steps]
        query_text_for_vector_search = state.original_query + " " + " ".join(uncovered_steps)
        
        link_texts_for_embedding = [link.context_around_link or link.anchor_text or "" for link in valid_new_links]
        
        try:
            query_embedding_list = await content_vector.generate_embeddings([query_text_for_vector_search])
            link_embeddings = await content_vector.generate_embeddings(link_texts_for_embedding)
            
            if query_embedding_list and query_embedding_list[0] is not None and link_embeddings:
                query_embedding = np.array(query_embedding_list[0])
                link_embeddings_np = np.array(link_embeddings)
                
                query_embedding_norm = query_embedding / np.linalg.norm(query_embedding)
                link_embeddings_norm = link_embeddings_np / np.linalg.norm(link_embeddings_np, axis=1, keepdims=True)
                
                similarities = np.dot(link_embeddings_norm, query_embedding_norm.T).flatten()
                
                vector_top_k = getattr(settings, 'DEEP_SEARCH_LINK_SELECTION_VECTOR_TOP_K', 50)
                num_links_to_select = min(len(valid_new_links), vector_top_k)
                top_k_indices = np.argsort(similarities)[-num_links_to_select:]
                
                links_for_llm_selection = [valid_new_links[i] for i in top_k_indices]
            else:
                logger.warning("[%s] Could not generate embeddings for pre-filtering links. Proceeding with truncated list.", task_id)
                links_for_llm_selection = valid_new_links[:pre_filter_threshold]
        except Exception as e_filter:
            logger.error("[%s] Error during vector pre-filtering of links: %s. Proceeding with truncated list.", task_id, e_filter, exc_info=True)
            links_for_llm_selection = valid_new_links[:pre_filter_threshold]

    prioritized_links_for_pq: List[models.CandidateLinkToExplore]
    if settings.DEEP_SEARCH_SMARTER_LINK_SELECTION_ENABLED and len(links_for_llm_selection) > settings.DEEP_SEARCH_SMARTER_LINK_TOP_N_TO_FOLLOW:
        uncovered_steps = [s for s in state.all_reasoning_steps if s not in state.covered_reasoning_steps]
        model_info_link_select = state.request_params.reasoning_model_info or {}
        if not model_info_link_select.get("name"): model_info_link_select["name"] = settings.DEFAULT_REASONING_MODEL
        
        link_selection_response = await llm_reasoner.select_best_links_to_follow(
            original_user_query=state.original_query, 
            links=links_for_llm_selection, 
            uncovered_reasoning_steps=uncovered_steps, 
            model_info=model_info_link_select, 
            api_config=state.api_config, 
            user_id=state.user_id,
            request_id=f"{task_id}_h{state.current_hop}_link_select", 
            top_n=settings.DEEP_SEARCH_SMARTER_LINK_TOP_N_TO_FOLLOW,
            is_cancelled_flag=state.is_cancelled_flag
        )
        if link_selection_response.get("usage"):
            current_aggregated_tokens.append(models.ModelUsageData(model_id=model_info_link_select.get("id",0), model_name=model_info_link_select.get("name"), **link_selection_response["usage"]))
        
        prioritized_links_for_pq = link_selection_response.get("selected_links", links_for_llm_selection[:settings.DEEP_SEARCH_SMARTER_LINK_TOP_N_TO_FOLLOW])
    else:
        prioritized_links_for_pq = links_for_llm_selection[:settings.DEEP_SEARCH_SMARTER_LINK_TOP_N_TO_FOLLOW * 2]

    updated_links_to_explore_list = list(state.links_to_explore_pq)
    current_pq_tie_breaker = state.pq_tie_breaker
    links_added_to_pq_count = 0
    for link_to_explore in prioritized_links_for_pq:
        if state.is_cancelled_flag.is_set():
            break
        if any(link_to_explore.url.lower().endswith(ext) for ext in ['.zip', '.exe', '.dmg', '.tar.gz', '.rar', '.jpg', '.png', '.gif']):
            continue
        priority_score = getattr(link_to_explore, 'priority_score', 0.5)
        heapq.heappush(updated_links_to_explore_list, (-priority_score, current_pq_tie_breaker, link_to_explore))
        current_pq_tie_breaker += 1
        links_added_to_pq_count += 1
        
    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"h{state.current_hop}_links_extracted", message=f"Prioritized {links_added_to_pq_count} links. Queue size: {len(updated_links_to_explore_list)}.")))
    
    return {"links_to_explore_pq": updated_links_to_explore_list, "pq_tie_breaker": current_pq_tie_breaker, "aggregated_token_usage": current_aggregated_tokens}

async def prepare_next_hop_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id; librarian_analysis_result: Optional[models.LibrarianAnalysisResult] = getattr(state, 'librarian_analysis_result', None)
    llm_reasoner: LLMReasoning = services["llm_reasoner"]; settings: app_config.Settings = services["settings"]
    current_aggregated_tokens = list(state.aggregated_token_usage); comptroller: Optional[ResearchComptroller] = services.get("research_comptroller")
    links_to_explore_pq_updated_this_hop = list(state.links_to_explore_pq); pq_tie_breaker_updated_this_hop = state.pq_tie_breaker
    full_research_plan_data_points_updated = [dp.copy() for dp in state.full_research_plan_data_points]; ask_llm_verification_map_updated = state.ask_llm_verification_map.copy()
    current_reasoning_dynamic_temperature_updated = state.current_reasoning_dynamic_temperature; hops_since_last_temp_increase_updated = state.hops_since_last_temp_increase
    significant_progress_after_temp_increase_updated = state.significant_progress_after_temp_increase; consecutive_low_diversity_hops_updated = state.consecutive_low_diversity_hops
    # Initialize updated_comptroller_strategy_re_evaluation_needed earlier
    updated_comptroller_strategy_re_evaluation_needed = getattr(state, "comptroller_strategy_re_evaluation_needed", False)
    final_next_hop_queries: List[str] = []
    current_force_reexecute_queries = set()

    if state.is_comptroller_review_failed and state.comptroller_feedback_for_retake:
        current_force_reexecute_queries.update(state.comptroller_feedback_for_retake)

        queries_from_feedback_to_regenerate = [fb_query for fb_query in state.comptroller_feedback_for_retake if state.failed_search_queries and fb_query in state.failed_search_queries]
        
        if queries_from_feedback_to_regenerate:
            alt_query_model_info = state.request_params.reasoning_model_info or {}
            if not alt_query_model_info.get("name"):
                alt_query_model_info["name"] = settings.DEFAULT_REASONING_MODEL
            alternative_comptroller_queries = []
            for original_failed_fb_query in queries_from_feedback_to_regenerate:
                if state.is_cancelled_flag.is_set():
                    break
                alt_fb_query_result = await llm_reasoner.generate_alternative_query(original_query=original_failed_fb_query, model_info=alt_query_model_info, api_config=state.api_config, user_id=state.user_id, request_id=f"{task_id}_h{state.current_hop}_alt_comptroller_query", is_cancelled_flag=state.is_cancelled_flag)
                if alt_fb_query_result.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=alt_query_model_info.get("id",0), model_name=alt_query_model_info.get("name"), **alt_fb_query_result["usage"]))
                
                newly_generated_alt_query = alt_fb_query_result.get("alternative_query")
                if newly_generated_alt_query and not alt_fb_query_result.get("error"):
                    alternative_comptroller_queries.append(newly_generated_alt_query)
                    current_force_reexecute_queries.add(newly_generated_alt_query) 
                    if original_failed_fb_query in current_force_reexecute_queries:
                        current_force_reexecute_queries.remove(original_failed_fb_query) 
                else:
                    alternative_comptroller_queries.append(original_failed_fb_query) 
            
            final_next_hop_queries = [q for q in state.comptroller_feedback_for_retake if q not in queries_from_feedback_to_regenerate] + alternative_comptroller_queries
        else:
            final_next_hop_queries = list(state.comptroller_feedback_for_retake)
        
        return {
            "current_queries_for_hop": final_next_hop_queries, 
            "force_reexecute_queries_this_hop": current_force_reexecute_queries, 
            "comptroller_feedback_for_retake": [], 
            "current_hop": state.current_hop + 1, 
            "stagnation_counter": 0, 
            "aggregated_token_usage": current_aggregated_tokens, 
            "full_research_plan_data_points": full_research_plan_data_points_updated, 
            "ask_llm_verification_map": ask_llm_verification_map_updated, 
            "links_to_explore_pq": links_to_explore_pq_updated_this_hop, 
            "pq_tie_breaker": pq_tie_breaker_updated_this_hop,
            "claims_previously_fact_checked_in_cycle": state.claims_previously_fact_checked_in_cycle
        }
    
    queries_for_direct_web_search: List[str] = []
    ask_llm_prefixed_queries: List[str] = []
    
    if librarian_analysis_result and librarian_analysis_result.suggested_new_sub_queries:
        ask_llm_prefixed_queries.extend([q for q in librarian_analysis_result.suggested_new_sub_queries if q.startswith("ASK_LLM:")])
    
    queries_to_attempt_generation_for = [q for q in (librarian_analysis_result.suggested_new_sub_queries if librarian_analysis_result else []) if not q.startswith("ASK_LLM:")]

    standard_flow_queries_needing_alternatives = []
    standard_flow_queries_ok = []

    if state.failed_search_queries:
        for query_cand in queries_to_attempt_generation_for:
            if state.is_cancelled_flag.is_set():
                break
            resolved_query_cand = llm_reasoner._resolve_placeholders(query_cand, state.full_research_plan_data_points)
            if resolved_query_cand in state.failed_search_queries: 
                standard_flow_queries_needing_alternatives.append(query_cand)
            else: 
                standard_flow_queries_ok.append(query_cand)
    else:
        standard_flow_queries_ok = list(queries_to_attempt_generation_for)

    generated_alternative_queries = []
    if standard_flow_queries_needing_alternatives:
        alt_query_model_info = state.request_params.reasoning_model_info or {}
        if not alt_query_model_info.get("name"):
            alt_query_model_info["name"] = settings.DEFAULT_REASONING_MODEL
        for original_failed_query in standard_flow_queries_needing_alternatives:
            if state.is_cancelled_flag.is_set():
                break
            contextual_original_failed_query = llm_reasoner._resolve_placeholders(original_failed_query, state.full_research_plan_data_points)
            alt_query_result = await llm_reasoner.generate_alternative_query(
                original_query=contextual_original_failed_query, 
                model_info=alt_query_model_info, 
                api_config=state.api_config, 
                user_id=state.user_id, 
                request_id=f"{task_id}_h{state.current_hop}_alt_std_query",
                is_cancelled_flag=state.is_cancelled_flag
            )
            if alt_query_result.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=alt_query_model_info.get("id",0), model_name=alt_query_model_info.get("name"), **alt_query_result["usage"]))
            if alt_query_result.get("alternative_query") and not alt_query_result.get("error"): 
                generated_alternative_queries.append(alt_query_result["alternative_query"])
            else: 
                generated_alternative_queries.append(contextual_original_failed_query) 
    
    queries_for_llm_input = standard_flow_queries_ok + generated_alternative_queries
    uncovered_reasoning_steps = [s for s in state.all_reasoning_steps if s not in state.covered_reasoning_steps]
    llm_generated_queries_next_hop: List[str] = []
    model_info_next_hop_gen: Dict[str, Any] = {}

    if uncovered_reasoning_steps or queries_for_llm_input:
        current_previous_queries = list(state.executed_search_queries) 
        
        model_info_next_hop_gen = state.request_params.reasoning_model_info or {}; 
        if not model_info_next_hop_gen.get("name"): model_info_next_hop_gen["name"] = settings.DEFAULT_REASONING_MODEL
        made_progress_this_hop_for_temp = bool(state.newly_covered_in_hop_check) 
        if made_progress_this_hop_for_temp: significant_progress_after_temp_increase_updated = True
        if settings.DEEP_SEARCH_ENABLE_DYNAMIC_TEMPERATURE:
            if state.stagnation_counter >= settings.DEEP_SEARCH_STAGNATION_TEMP_INCREASE_THRESHOLD and hops_since_last_temp_increase_updated >= settings.DEEP_SEARCH_MIN_HOPS_BETWEEN_TEMP_INCREASE and current_reasoning_dynamic_temperature_updated < settings.DEEP_SEARCH_REASONING_MAX_TEMP:
                current_reasoning_dynamic_temperature_updated = min(settings.DEEP_SEARCH_REASONING_MAX_TEMP, current_reasoning_dynamic_temperature_updated + settings.DEEP_SEARCH_DYNAMIC_TEMP_INCREMENT)
                hops_since_last_temp_increase_updated = 0; significant_progress_after_temp_increase_updated = False 
                await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"h{state.current_hop}_temp_increase", message=f"Strategist increasing exploration temperature to {current_reasoning_dynamic_temperature_updated:.2f}.")))
            elif significant_progress_after_temp_increase_updated and current_reasoning_dynamic_temperature_updated > settings.DEEP_SEARCH_REASONING_DEFAULT_TEMP:
                current_reasoning_dynamic_temperature_updated = max(settings.DEEP_SEARCH_REASONING_DEFAULT_TEMP, current_reasoning_dynamic_temperature_updated - (settings.DEEP_SEARCH_DYNAMIC_TEMP_INCREMENT / 2))
                significant_progress_after_temp_increase_updated = False 
            else: hops_since_last_temp_increase_updated +=1
        model_info_next_hop_gen['temperature'] = current_reasoning_dynamic_temperature_updated

        next_hop_queries_response = await llm_reasoner.generate_next_hop_queries(
            original_user_query=state.original_query, 
            uncovered_reasoning_steps=uncovered_reasoning_steps, 
            insights_from_analyst=librarian_analysis_result, 
            previous_queries=current_previous_queries, 
            model_info=model_info_next_hop_gen, 
            api_config=state.api_config, 
            user_id=state.user_id, 
            request_id=f"{task_id}_h{state.current_hop}_next_queries", 
            document_context_summary=state.document_context_summary, 
            is_document_focused_query=state.request_params.is_document_focused_query,
            task_date_context=state.task_date_context,
            is_cancelled_flag=state.is_cancelled_flag
        )
        if next_hop_queries_response.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=model_info_next_hop_gen.get("id",0), model_name=model_info_next_hop_gen.get("name"), **next_hop_queries_response["usage"]))
        
        raw_llm_generated_queries = next_hop_queries_response.get("queries", [])
        for q_cand in raw_llm_generated_queries:
            if q_cand and \
               q_cand not in ["NO_SEARCH_NEEDED", "NONE"] and \
               not q_cand.startswith("ASK_LLM:") and \
               not q_cand.startswith("USER_PROVIDED_CONTEXT_ONLY") and \
               len(q_cand.split()) > 1 and \
               len(q_cand.split()) < 15: 
                llm_generated_queries_next_hop.append(q_cand)
            elif q_cand and q_cand.startswith("ASK_LLM:"): 
                if q_cand not in ask_llm_prefixed_queries: 
                    ask_llm_prefixed_queries.append(q_cand)
            else:
                pass
    
    ask_llm_prefixed_queries = list(dict.fromkeys(ask_llm_prefixed_queries)) 

    model_info_ask_llm = state.request_params.reasoning_model_info or {}; 
    if not model_info_ask_llm.get("name"): model_info_ask_llm["name"] = settings.DEFAULT_REASONING_MODEL
    for ask_query_full in ask_llm_prefixed_queries:
        if state.is_cancelled_flag.is_set():
            break
        question_to_ask_llm = ask_query_full.replace("ASK_LLM:", "").strip()
        original_dp_name = question_to_ask_llm

        # Find the corresponding data point
        dp_to_process = next((dp for dp in full_research_plan_data_points_updated if dp.get("name") == original_dp_name), None)

        if not dp_to_process:
            continue

        # Check if it's already resolved or in a final state
        if dp_to_process.get("status") not in ["NEEDS_RETRIEVAL_WEB", "PENDING_VERIFICATION_WEB", "PROPOSED_FROM_LLM_KNOWLEDGE", "NEEDS_CALCULATION", "FAILED_ASK_LLM"]:
            continue

        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"h{state.current_hop}_ask_llm_direct_reproc", message=f"Asking LLM (gen): {question_to_ask_llm[:50]}...")))
        direct_answer_result = await llm_reasoner.get_direct_fact(
            question=question_to_ask_llm,
            context_summary=state.document_context_summary,
            model_info=model_info_ask_llm,
            api_config=state.api_config,
            user_id=state.user_id, 
            request_id=f"{task_id}_h{state.current_hop}_direct_fact_gen_{uuid.uuid4().hex[:6]}",
            is_cancelled_flag=state.is_cancelled_flag
        )
        if direct_answer_result.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=model_info_ask_llm.get("id",0), model_name=model_info_ask_llm.get("name"), **direct_answer_result["usage"]))
        answer_text = direct_answer_result.get("answer"); needs_verification = direct_answer_result.get("needs_verification", False)
        found_dp_for_update = False
        for dp in full_research_plan_data_points_updated:
            if dp.get("name") == original_dp_name: 
                found_dp_for_update = True
                if answer_text and not needs_verification: dp["value"] = answer_text; dp["status"] = "RESOLVED_BY_LLM"; dp["verification_status"] = "LLM_DIRECT_ANSWER_UNVERIFIED"; dp["resolution_details"] = "Direct answer from LLM."
                elif answer_text and needs_verification:
                    dp["verification_status"] = "LLM_PROPOSED_PENDING_WEB_VERIFICATION"
                    verification_query_result = await llm_reasoner.formulate_verification_query(
                        question=question_to_ask_llm, 
                        proposed_answer=answer_text, 
                        model_info=model_info_ask_llm, 
                        api_config=state.api_config, 
                        user_id=state.user_id, 
                        request_id=f"{task_id}_h{state.current_hop}_verify_query_gen_{uuid.uuid4().hex[:6]}",
                        is_cancelled_flag=state.is_cancelled_flag
                    )
                    if verification_query_result.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=model_info_ask_llm.get("id",0), model_name=model_info_ask_llm.get("name"), **verification_query_result["usage"]))
                    verification_query = verification_query_result.get("verification_query")
                    if verification_query: 
                        if verification_query not in queries_for_direct_web_search: queries_for_direct_web_search.append(verification_query)
                        ask_llm_verification_map_updated[verification_query] = {"original_question": question_to_ask_llm, "proposed_answer": answer_text, "original_dp_name": original_dp_name}
                        dp["status"] = "PENDING_VERIFICATION_WEB"; dp["verification_status"] = "LLM_PROPOSED_PENDING_WEB_VERIFICATION"; dp["resolution_details"] = f"LLM proposed answer, pending web verification with query: {verification_query}"
                    else: dp["status"] = "FAILED_VERIFICATION_QUERY_GEN"; dp["verification_status"] = "VERIFICATION_QUERY_GENERATION_FAILED"
                else: dp["status"] = "FAILED_ASK_LLM"; dp["verification_status"] = "ASK_LLM_FAILED"
                break 
        if not found_dp_for_update:
            pass
        else:
            # After processing, remove the ASK_LLM query from the list to prevent re-processing
            # This is implicitly handled by the logic that generates the queries for the next hop,
            # as ASK_LLM queries are processed here and not added to the web search list.
            pass

    raw_final_next_hop_queries = list(dict.fromkeys(
        queries_for_direct_web_search + 
        generated_alternative_queries + 
        llm_generated_queries_next_hop + 
        standard_flow_queries_ok 
    ))

    # Filter out queries with unresolved placeholders before LLM filtering
    executable_raw_queries = []
    deferred_queries_this_hop = []
    for raw_q in raw_final_next_hop_queries:
        resolved_q_check = llm_reasoner._resolve_placeholders(raw_q, full_research_plan_data_points_updated)
        # More robust check for any unresolved placeholder patterns
        if not any(marker in resolved_q_check for marker in ["[UNRESOLVED_PLACEHOLDER]", "[VALUE_IS_NONE_FOR_", "[UNRESOLVED_DP_ID_", "[UNRESOLVED_ATTRIBUTE_"]):
            executable_raw_queries.append(raw_q) # Add the original raw query if its resolved version is clean
        else:
            deferred_queries_this_hop.append(raw_q) # Keep track of deferred queries

    if executable_raw_queries and settings.DEEP_SEARCH_SMART_QUERY_EXPANSION_FILTER_ENABLED:
        filter_query_model_info = model_info_next_hop_gen.copy(); filter_query_model_info['temperature'] = settings.DEEP_SEARCH_QUERY_FILTER_TEMP
        filtered_query_result = await llm_reasoner.filter_queries_for_relevance_and_novelty(
            original_user_query=state.original_query, 
            candidate_queries=executable_raw_queries, # Use executable queries
            executed_queries=list(state.executed_search_queries), 
            model_info=filter_query_model_info, 
            api_config=state.api_config, 
            user_id=state.user_id, 
            request_id=f"{task_id}_h{state.current_hop}_filter_queries", 
            max_queries_to_return=settings.DEEP_SEARCH_MAX_QUERIES_PER_HOP,
            is_cancelled_flag=state.is_cancelled_flag
        )
        if filtered_query_result.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=filter_query_model_info.get("id",0), model_name=filter_query_model_info.get("name"), **filtered_query_result["usage"]))
        final_next_hop_queries = filtered_query_result.get("filtered_queries", executable_raw_queries[:settings.DEEP_SEARCH_MAX_QUERIES_PER_HOP])
    else: 
        final_next_hop_queries = executable_raw_queries[:settings.DEEP_SEARCH_MAX_QUERIES_PER_HOP]
    
    resolved_data_points_this_hop = any(old_dp.get("status") in ["NEEDS_RETRIEVAL_WEB", "PROPOSED_FROM_LLM_KNOWLEDGE", "PENDING_VERIFICATION_WEB"] and new_dp.get("status") in ["RESOLVED_BY_LLM", "RESOLVED_BY_WEB_VERIFICATION"] for old_dp, new_dp in zip(state.full_research_plan_data_points, full_research_plan_data_points_updated))
    made_progress_this_hop = bool(state.newly_covered_in_hop_check) or bool(final_next_hop_queries) or resolved_data_points_this_hop

    if not made_progress_this_hop and not final_next_hop_queries and not links_to_explore_pq_updated_this_hop: 
        updated_stagnation_counter = state.stagnation_counter + 1
    else: 
        updated_stagnation_counter = 0
        
    next_hop_number = state.current_hop + 1
    
    multihop_progress_data_next_hop = models.MultiHopProgressData(
        current_hop=state.current_hop, # This is the hop that just completed
        max_hops=state.max_hops, 
        hop_stage_name=f"NextHopPrep_Hop{state.current_hop}", 
        hop_stage_message="Next queries defined.", 
        initial_reasoning_steps=state.all_reasoning_steps, 
        covered_reasoning_steps=list(state.covered_reasoning_steps), 
        uncovered_reasoning_steps=uncovered_reasoning_steps, 
        new_queries_for_next_hop=final_next_hop_queries
    )
    await output_queue.put(models.SSEEvent(
        task_id=task_id, 
        event_type="progress", 
        payload=models.SSEProgressData(
            stage=f"h{state.current_hop}_next_hop_prep_complete", 
            message=f"Strategist: Planning for hop {next_hop_number}. New queries: {len(final_next_hop_queries)}.", 
            details=multihop_progress_data_next_hop.model_dump(exclude_none=True) # Use .model_dump()
            # is_key_summary=True REMOVED for this message
        )
    ))
    
    return {
        "current_queries_for_hop": final_next_hop_queries, 
        "force_reexecute_queries_this_hop": current_force_reexecute_queries, 
        "stagnation_counter": updated_stagnation_counter, 
        "current_hop": next_hop_number, 
        "aggregated_token_usage": current_aggregated_tokens, 
        "current_reasoning_dynamic_temperature": current_reasoning_dynamic_temperature_updated, 
        "hops_since_last_temp_increase": hops_since_last_temp_increase_updated, 
        "significant_progress_after_temp_increase": significant_progress_after_temp_increase_updated, 
        "consecutive_low_diversity_hops": consecutive_low_diversity_hops_updated, 
        "full_research_plan_data_points": full_research_plan_data_points_updated, 
        "ask_llm_verification_map": ask_llm_verification_map_updated, 
        "links_to_explore_pq": links_to_explore_pq_updated_this_hop, 
        "pq_tie_breaker": pq_tie_breaker_updated_this_hop, 
        "processed_chunks_this_hop": [], 
        "newly_extracted_links_this_hop": [], 
        "search_results_this_hop": [], 
        "newly_covered_in_hop_check": [], 
        "comptroller_strategy_re_evaluation_needed": updated_comptroller_strategy_re_evaluation_needed, 
        "task_date_context": state.task_date_context,
        "claims_previously_fact_checked_in_cycle": set() # Reset for the next hop/synthesis cycle
    }

async def synthesize_report_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id
    llm_reasoner: LLMReasoning = services.get("llm_reasoner") # Use .get for safety
    content_vector = await get_content_vector()
    search_scraper: SearchScrape = services.get("search_scraper") # Use .get for safety
    settings: app_config.Settings = services.get("settings") # Use .get for safety
    current_aggregated_tokens = list(state.aggregated_token_usage)
    gathered_fact_check_snippets: List[Dict[str, str]] = []

    if not all([llm_reasoner, content_vector, search_scraper, settings]):
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="error", payload=models.SSEErrorData(error_message="Critical service missing in synthesize_report_node.", stage="synthesis_service_check", is_fatal=True)))
        # Consider how to update state to reflect this failure, e.g., set an error flag.
        # For now, returning a minimal update to avoid further errors.
        return {"final_report_md": "Error: Critical service missing.", "report_sources": [], "aggregated_token_usage": current_aggregated_tokens}
    
    # Natural reasoning message for synthesis phase
    covered_topics = [step for step in state.all_reasoning_steps if step in state.covered_reasoning_steps]
    synthesis_reasoning_msg = agent_dialogue.SYNTHESIS_REASONING.format(
        covered_topics=', '.join(covered_topics[:2]) if covered_topics else 'the information I gathered'
    )
    
    await output_queue.put(models.SSEEvent(
        task_id=task_id, 
        event_type="progress", 
        payload=models.SSEProgressData(
            stage="synthesis_reasoning", 
            message=synthesis_reasoning_msg,
            is_key_summary=True
        )
    ))

    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="synthesis_start", message=agent_dialogue.SYNTHESIS_START)))

    current_cycle_fact_checked_claims: Set[str] = set()
    if state.is_comptroller_review_failed:
        pass
    else:
        current_cycle_fact_checked_claims = state.claims_previously_fact_checked_in_cycle.copy()

    # Enhanced vector-based pre-filtering for synthesis
    all_available_chunks = list(state.all_processed_chunks_this_task.values())
    if len(all_available_chunks) > 30:
        # Multi-query approach for synthesis
        synthesis_queries = [
            state.original_query,
            " ".join(state.all_reasoning_steps[:3]),  # Top 3 reasoning steps
        ]
        
        # Add resolved facts as context
        resolved_facts = []
        for dp in state.full_research_plan_data_points:
            if dp.get("value") and dp.get("status") in ["RESOLVED_BY_LLM", "RESOLVED_BY_WEB_VERIFICATION"]:
                resolved_facts.append(f"{dp.get('name', '')}: {dp.get('value', '')}")
        
        if resolved_facts:
            synthesis_queries.append(" ".join(resolved_facts[:5]))
        
        # Vector search for each query
        all_synthesis_results = []
        for query in synthesis_queries:
            try:
                query_embedding = await content_vector.generate_embeddings([query])
                if query_embedding and query_embedding[0]:
                    results = await content_vector.search_vectors(
                        query_vector=query_embedding[0],
                        limit=20,
                        group_id=task_id
                    )
                    all_synthesis_results.extend(results)
            except Exception as e: logging.debug("Suppressed %s: %s", type(e).__name__, e)
        
        # Deduplicate and score
        synthesis_chunk_scores = {}
        for result in all_synthesis_results:
            if result.id not in synthesis_chunk_scores:
                synthesis_chunk_scores[result.id] = result.similarity
            else:
                synthesis_chunk_scores[result.id] = max(synthesis_chunk_scores[result.id], result.similarity)
        
        # Select top chunks with quality scoring
        synthesis_candidates = []
        for chunk_id, similarity in synthesis_chunk_scores.items():
            chunk = state.all_processed_chunks_this_task.get(chunk_id)
            if chunk:
                quality_score = calculate_enhanced_quality_score(
                    chunk=chunk,
                    vector_similarity=similarity,
                    query_keywords=set(re.findall(r'\b\w+\b', state.original_query.lower()))
                )
                synthesis_candidates.append((chunk, quality_score))
        
        # Sort by quality and take top candidates
        synthesis_candidates.sort(key=lambda x: x[1], reverse=True)

        chunks_for_synthesis = [chunk for chunk, score in synthesis_candidates[:settings.DEEP_SEARCH_SYNTHESIS_MAX_CHUNKS]]

        # ADD FALLBACK FOR ZERO CHUNKS
        if not chunks_for_synthesis:
            # Use accumulated chunks from the research process
            fallback_chunks = list(state.accumulated_top_chunks_for_synthesis)
            if not fallback_chunks:
                # Last resort: use any available chunks
                fallback_chunks = list(all_available_chunks)[:50]
            chunks_for_synthesis = fallback_chunks[:settings.DEEP_SEARCH_SYNTHESIS_MAX_CHUNKS]

    else:
        chunks_for_synthesis = all_available_chunks

    if not chunks_for_synthesis: # Check after potential limiting
        final_report_md = agent_dialogue.SYNTHESIS_NO_CONTENT_FALLBACK
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="markdown_chunk", payload=models.SSEMarkdownChunkData(chunk_id=0, content=final_report_md, is_final_chunk=True)))
        return {"final_report_md": final_report_md, "report_sources": [], "aggregated_token_usage": current_aggregated_tokens, "claims_previously_fact_checked_in_cycle": current_cycle_fact_checked_claims}
    
    comptroller: Optional[ResearchComptroller] = services.get("research_comptroller"); updated_low_confidence_synthesis_mode = state.low_confidence_synthesis_mode
    if comptroller and comptroller.should_enable_low_confidence_synthesis_mode(state): updated_low_confidence_synthesis_mode = True; await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="synthesis_low_confidence_mode", message="Comptroller advises cautious synthesis.")))
    
    def _is_feedback_repetitive(new_feedback_list: List[str], previous_feedback_history: List[List[str]], similarity_threshold=0.7) -> bool:
        if not new_feedback_list or not previous_feedback_history: return False
        new_feedback_set = set(re.findall(r'\b\w{3,}\b', " ".join(new_feedback_list).lower())); 
        if not new_feedback_set: return False
        for old_feedback_list in previous_feedback_history:
            old_feedback_set = set(re.findall(r'\b\w{3,}\b', " ".join(old_feedback_list).lower())); 
            if not old_feedback_set: continue
            intersection_size = len(new_feedback_set.intersection(old_feedback_set)); union_size = len(new_feedback_set.union(old_feedback_set))
            similarity = (intersection_size / union_size) if union_size > 0 else (1.0 if not new_feedback_set and not old_feedback_set else 0.0)
            if similarity >= similarity_threshold: return True
        return False

    is_repetitive = False; current_feedback_for_check = state.comptroller_feedback_for_retake if isinstance(state.comptroller_feedback_for_retake, list) else []
    if current_feedback_for_check and state.previous_comptroller_feedback: is_repetitive = _is_feedback_repetitive(current_feedback_for_check, state.previous_comptroller_feedback)
    updated_previous_comptroller_feedback = list(state.previous_comptroller_feedback); updated_comptroller_feedback_retry_count = state.comptroller_feedback_retry_count
    if current_feedback_for_check:
        updated_previous_comptroller_feedback.append(list(current_feedback_for_check))
        if len(updated_previous_comptroller_feedback) > settings.DEEP_SEARCH_MAX_FEEDBACK_HISTORY: updated_previous_comptroller_feedback.pop(0)
        if is_repetitive: updated_comptroller_feedback_retry_count += 1; await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage=f"h{state.current_hop}_repetitive_feedback_detected", message=f"Warning: Repetitive feedback detected. Retry count: {updated_comptroller_feedback_retry_count}.")))
        else: updated_comptroller_feedback_retry_count = 0
    
    synthesis_model_info = state.request_params.synthesis_model_info or state.request_params.reasoning_model_info or {}; 
    if not synthesis_model_info.get("name"): synthesis_model_info["name"] = settings.DEFAULT_REASONING_MODEL
    if settings.DEEP_SEARCH_ENABLE_DYNAMIC_TEMPERATURE: synthesis_model_info['temperature'] = settings.DEEP_SEARCH_SYNTHESIS_DEFAULT_TEMP
    synthesis_model_info['extend_token_window'] = True
    
    # Action 1: Ensure reasoning_steps passed to synthesize_initial_draft are fully resolved.
    resolved_reasoning_steps_for_synthesis = [
        llm_reasoner._resolve_placeholders(s, state.full_research_plan_data_points) 
        for s in state.all_reasoning_steps
    ]

    # Action 2: Refine construction of resolved_facts_summary
    resolved_facts_context_parts = ["Key Information Determined During Research:"]
    for dp in state.full_research_plan_data_points:
        dp_name_resolved = llm_reasoner._resolve_placeholders(dp.get("name", "DP"), state.full_research_plan_data_points)
        dp_value = dp.get("value")
        dp_status = dp.get("status", "").upper()

        # Only include facts that are resolved/verified or explicitly failed/missing.
        # Exclude intermediate states like "PROPOSED_FROM_LLM_KNOWLEDGE", "PENDING_VERIFICATION_WEB", etc.
        # The synthesis prompt (Instruction #4) handles how to present information based on its final state.
        if dp_value is not None and dp_status not in [
            "PROPOSED_FROM_LLM_KNOWLEDGE", 
            "PENDING_VERIFICATION_WEB", 
            "LLM_PROPOSED_PENDING_WEB_VERIFICATION",
            "NEEDS_VERIFICATION_WEB" # Added this as it's also an intermediate state
        ]:
            resolved_facts_context_parts.append(f"- {dp_name_resolved}: {str(dp_value)}")
        elif "FAILED" in dp_status or dp_status == "MISSING":
            resolved_facts_context_parts.append(f"- {dp_name_resolved}: Information could not be definitively found or verified.")
        # Other statuses (like proposed, pending) are implicitly omitted from this direct summary,
        # allowing the main synthesis prompt to guide the LLM on how to handle gaps or unverified info.
    resolved_facts_context_str = "\n".join(resolved_facts_context_parts)

    # Pre-synthesis summarization to manage context window
    synthesis_context_text = "\n\n".join([chunk.text_content for chunk in chunks_for_synthesis])
    # Estimate token count (simple approximation)
    estimated_tokens = len(synthesis_context_text.split()) * 1.3
    
    # Define a threshold, e.g., 16k tokens, for when to summarize
    # This should be less than the model's actual context window to leave room for the prompt itself
    pre_synthesis_summary_threshold = getattr(settings, 'DEEP_SEARCH_PRE_SYNTHESIS_SUMMARY_THRESHOLD', 16000)

    if estimated_tokens > pre_synthesis_summary_threshold:
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="pre_synthesis_summarization", message=f"Collected research context is large ({int(estimated_tokens)} tokens). Condensing for final synthesis...")))
        
        summarization_model_info = state.request_params.reasoning_model_info or {}
        if not summarization_model_info.get("name"):
            summarization_model_info["name"] = settings.DEFAULT_REASONING_MODEL
        
        summary_result = await llm_reasoner.summarize_chunk_in_isolation(
            chunk_text=synthesis_context_text,
            model_info=summarization_model_info,
            api_config=state.api_config,
            user_id=state.user_id,
            request_id=f"{task_id}_pre_synthesis_summary"
        )
        
        if summary_result.get("summary") and not summary_result.get("error"):
            synthesis_context_text = summary_result["summary"]
            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="pre_synthesis_summarization_complete", message="Research context condensed.")))
            if summary_result.get("usage"):
                current_aggregated_tokens.append(models.ModelUsageData(model_id=summarization_model_info.get("id",0), model_name=summarization_model_info.get("name"), **summary_result["usage"]))
        else:
            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="pre_synthesis_summarization_failed", message="Warning: Failed to condense research context. Proceeding with original content.")))
    
    draft_synthesis_response = await llm_reasoner.synthesize_initial_draft(
        original_user_query=state.original_query, 
        accumulated_top_chunks_text=[models.ContentChunk(chunk_id="condensed_context", text_content=synthesis_context_text, original_url="condensed_summary://", page_title="Condensed Summary", chunk_index_in_page=0, depth=state.current_hop)],
        model_info=synthesis_model_info, 
        api_config=state.api_config, 
        user_id=state.user_id, 
        request_id=f"{task_id}_synthesis_draft_graph", 
        reasoning_steps=resolved_reasoning_steps_for_synthesis,
        is_document_focused_query=state.request_params.is_document_focused_query, 
        document_context_summary_for_synthesis=state.document_context_summary, 
        resolved_facts_summary=resolved_facts_context_str,
        low_confidence_synthesis_mode=updated_low_confidence_synthesis_mode, 
        task_date_context=state.task_date_context, 
        comptroller_feedback=state.comptroller_feedback_for_retake,
        existing_draft_for_revision=None,
        processing_language=state.processing_language,
        is_cancelled_flag=state.is_cancelled_flag
    )
    if draft_synthesis_response.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=synthesis_model_info.get("id",0), model_name=synthesis_model_info.get("name"), **draft_synthesis_response["usage"]))
    draft_report_md = draft_synthesis_response.get("draft_text", agent_dialogue.SYNTHESIS_DRAFT_ERROR_FALLBACK)
    final_report_md = draft_report_md 
    
    if settings.DEEP_SEARCH_ENABLE_FACT_CHECKING_REFINE_STEP and draft_report_md and "Error during draft synthesis" not in draft_report_md:
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="fact_checking_start", message="Initiating fact-checking and refinement...")))
        fact_check_model_info = state.request_params.reasoning_model_info or {}
        if not fact_check_model_info.get("name"): fact_check_model_info["name"] = settings.DEFAULT_REASONING_MODEL
        
        fact_check_queries_result = await llm_reasoner.review_draft_and_identify_fact_check_queries(
            draft_report_text=draft_report_md, 
            model_info=fact_check_model_info,
            api_config=state.api_config,
            user_id=state.user_id, 
            request_id=f"{task_id}_fact_check_identify",
            claims_previously_checked=current_cycle_fact_checked_claims, # Pass currently checked claims
            is_cancelled_flag=state.is_cancelled_flag
        )
        if fact_check_queries_result.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=fact_check_model_info.get("id",0),model_name=fact_check_model_info.get("name"),**fact_check_queries_result["usage"]))
        
        fact_check_requests = fact_check_queries_result.get("fact_check_requests", [])
        newly_identified_claims_this_call = fact_check_queries_result.get("newly_identified_claims_this_call", set())
        current_cycle_fact_checked_claims.update(newly_identified_claims_this_call) # Update the set for this cycle

        GENERAL_WEB_FACT_CHECK_PROVIDERS = ["brave", "google_custom_search", "bing", "duckduckgo", "wikipedia"]
        default_search_providers = list(settings.SEARCH_PROVIDERS_DEFAULT) if isinstance(settings.SEARCH_PROVIDERS_DEFAULT, list) else []

        if fact_check_requests:
            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="fact_checking_queries_generated", message=f"Identified {len(fact_check_requests)} claims for fact-checking.")))
            gathered_fact_check_snippets.clear()
            
            FAST_FACT_CHECK_PROVIDERS_BASE = [
                p for p in GENERAL_WEB_FACT_CHECK_PROVIDERS 
                if p.lower() not in ["openalex", "courtlistener"]
            ]
            if not FAST_FACT_CHECK_PROVIDERS_BASE: 
                FAST_FACT_CHECK_PROVIDERS_BASE = ["duckduckgo", "brave"] 

            for fc_req_idx, fc_req in enumerate(fact_check_requests[:settings.DEEP_SEARCH_MAX_FACT_CHECK_QUERIES]):
                if state.is_cancelled_flag.is_set():
                    logger.info("[%s] SynthesizeReportNode: Cancellation detected during fact-checking loop.", task_id)
                    break
                claim = fc_req.get("claim_to_verify"); query = fc_req.get("verification_query"); preferred_provider_from_llm = fc_req.get("preferred_provider", "general_web")
                if not claim or not query: continue
                
                # Extract key topic from claim for natural message
                claim_topic = claim
                
                fact_check_reasoning_msg = agent_dialogue.FACT_CHECK_REASONING.format(
                    claim_topic=claim_topic
                )
                
                await output_queue.put(models.SSEEvent(
                    task_id=task_id, 
                    event_type="progress", 
                    payload=models.SSEProgressData(
                        stage=f"fact_checking_claim_{fc_req_idx+1}", 
                        message=fact_check_reasoning_msg,
                        is_key_summary=True
                    )
                ))
        
                search_providers_for_fc: List[str] = []
                if preferred_provider_from_llm != "general_web" and preferred_provider_from_llm.lower() in [p.lower() for p in FAST_FACT_CHECK_PROVIDERS_BASE]:
                    search_providers_for_fc = [preferred_provider_from_llm]
                else:
                    custom_req_fast_providers = [p for p in (state.request_params.search_providers or default_search_providers) if p.lower() in [fp.lower() for fp in FAST_FACT_CHECK_PROVIDERS_BASE]]
                    combined_fast_providers = list(dict.fromkeys(custom_req_fast_providers + FAST_FACT_CHECK_PROVIDERS_BASE))
                    if not combined_fast_providers: 
                        combined_fast_providers = ["duckduckgo", "brave"]
                    search_providers_for_fc = random.sample(combined_fast_providers, len(combined_fast_providers))
                
                logger.info("[%s] Fact-checking claim '%s...' using actual providers: %s", task_id, claim[:200], search_providers_for_fc)
                fc_search_results, _ = await search_scraper.execute_search_pass(
                    query=query, 
                    search_providers=search_providers_for_fc, 
                    api_config=state.api_config, 
                    max_results_per_query=1, 
                    is_fact_checking_pass=True,
                    is_cancelled_flag=state.is_cancelled_flag
                )
                snippet_for_claim = f"Claim: {claim}\nVerification Query: {query}\nResult: No information found."
                if fc_search_results and fc_search_results[0].get("url"):
                    scrape_output = await search_scraper.scrape_url_with_vetting(url=fc_search_results[0]["url"], original_source_info={"title": "Fact-check source"}, is_cancelled_flag=state.is_cancelled_flag)
                    if scrape_output.get("content"): snippet_for_claim = f"Claim: {claim}\nVerification Query: {query}\nSource URL: {fc_search_results[0]['url']}\nRelevant Snippet: {scrape_output['content'][:500]}..."
                gathered_fact_check_snippets.append({"claim_to_verify": claim, "verification_query": query, "result_snippet": snippet_for_claim})
    if gathered_fact_check_snippets:
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="fact_checking_refining_report", message="Refining report based on fact-check results...")))
        refinement_model_info = state.request_params.synthesis_model_info or {}; 
        if not refinement_model_info.get("name"): refinement_model_info["name"] = settings.DEFAULT_REASONING_MODEL
        refined_report_result = await llm_reasoner.refine_report_with_fact_check_results(
            initial_draft_text=draft_report_md, 
            fact_check_results=gathered_fact_check_snippets, 
            model_info=refinement_model_info, 
            api_config=state.api_config, 
            user_id=state.user_id,
            original_user_query=state.original_query, 
            request_id=f"{task_id}_fact_check_refine",
            is_cancelled_flag=state.is_cancelled_flag
        )
        if refined_report_result.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=refinement_model_info.get("id",0),model_name=refinement_model_info.get("name"),**refined_report_result["usage"]))
        if refined_report_result.get("final_report_text") and not refined_report_result.get("error"): final_report_md = refined_report_result["final_report_text"]
    
    report_with_llm_markers, llm_generated_citation_map = citations.extract_and_map_llm_citations(final_report_md)
    
    # --- Start of Citation Standardization ---
    
    # 1. Create a sorted list of URLs from the LLM-generated map to ensure consistent ordering.
    # The key of llm_generated_citation_map is the old marker (e.g., 'A', 'B'), value is the URL.
    # We sort by the old marker to maintain a logical sequence.
    sorted_old_markers = sorted(llm_generated_citation_map.keys())
    
    # 2. Create the new standardized maps.
    old_to_new_citation_map: Dict[str, str] = {}
    new_citation_to_url_map: Dict[str, str] = {}
    report_text_with_new_markers = report_with_llm_markers

    for i, old_marker in enumerate(sorted_old_markers):
        new_marker = f"S{i + 1}"
        url = llm_generated_citation_map[old_marker]
        
        old_to_new_citation_map[old_marker] = new_marker
        new_citation_to_url_map[new_marker] = url
        
        # 3. Replace old markers in the text with new ones.
        # Use regex to ensure we're replacing the full marker, e.g., `[A]` and not just `A`.
        report_text_with_new_markers = re.sub(
            r'\[(' + re.escape(old_marker) + r')\]', 
            f'[{new_marker}]', 
            report_text_with_new_markers
        )

    # Update the maps used for the rest of the function
    current_url_citation_map = {v: k for k, v in new_citation_to_url_map.items()} # Needs url -> marker format
    used_citations_map = citations.get_citations(report_text_with_new_markers, new_citation_to_url_map)
    
    # --- End of Citation Standardization ---

    report_sources_list_for_payload: List[models.ReportSourceItem] = []
    sources_md_lines = ["\n\n---\n\n## Sources\n"]
    
    all_contributing_urls = set(used_citations_map.values())
    for chunk in state.accumulated_top_chunks_for_synthesis:
        if chunk.original_url:
            all_contributing_urls.add(chunk.original_url)

    if all_contributing_urls:
        # Create a normalized lookup map for all processed chunks
        normalized_chunk_map = {
            _normalize_url_for_comparison(chunk.original_url): chunk 
            for chunk in state.all_processed_chunks_this_task.values() if chunk.original_url
        }

        source_items = []
        # Use the standardized `new_citation_to_url_map` which is already sorted and contains all unique URLs.
        for marker, url in new_citation_to_url_map.items():
            normalized_url = _normalize_url_for_comparison(url)
            source_chunk_info = normalized_chunk_map.get(normalized_url)
            
            title = "Source"
            trust_score_val = None
            provider_name_val = None
            domain_val = None
            retrieved_at_val = None

            if source_chunk_info:
                title = source_chunk_info.page_title
                if source_chunk_info.vector_metadata:
                    if not title:
                        title = source_chunk_info.vector_metadata.get('page_title')
                    trust_score_val = source_chunk_info.vector_metadata.get("trust_score")
                    provider_name_val = source_chunk_info.vector_metadata.get("provider_name")
                    domain_val = source_chunk_info.vector_metadata.get("domain")
                    retrieved_at_val = source_chunk_info.vector_metadata.get("retrieved_at")

            final_domain = domain_val or (url.split('//')[-1].split('/')[0].replace('www.', '') if url else "unknown")

            if not title or title == "Source" or title.strip() == "":
                title = final_domain

            source_items.append(models.ReportSourceItem(
                url=url,
                title=title,
                citation_marker=f"[{marker}]",
                trust_score=trust_score_val,
                provider_name=provider_name_val,
                domain=final_domain,
                retrieved_at=retrieved_at_val
            ))

        # Sort by the numeric part of the 'S#' marker for final display
        source_items.sort(key=lambda x: int(x.citation_marker.strip("[]S")))

        # Generate the markdown from the sorted list with the new format
        for item in source_items:
            # Base markdown line: [S1] [Title](URL)
            md_line = f"- {item.citation_marker} [{item.title}]({item.url})"
            
            # Append trust score if available
            trust_str = f"Trust: {item.trust_score:.2f}" if item.trust_score is not None else ""
            
            # Prepare domain and provider string
            domain_provider_parts = []
            if item.domain:
                domain_provider_parts.append(item.domain)
            if item.provider_name:
                domain_provider_parts.append(item.provider_name)
            domain_provider_str = " / ".join(domain_provider_parts)

            # Combine details into a single parenthesis block if any exist
            details = []
            if trust_str:
                details.append(trust_str)
            if domain_provider_str:
                details.append(domain_provider_str)
            
            if details:
                md_line += f" ({' | '.join(details)})"

            sources_md_lines.append(md_line)
        
        report_sources_list_for_payload = source_items

    else:
        sources_md_lines.append("No primary web sources cited.")
        
    sources_md_section = "\n".join(sources_md_lines)
    report_date_line = f"\n\n---\n*Report generated based on information available up to or relevant to: {state.task_date_context}*" if state.task_date_context else ""
    final_report_md_with_sources_and_date = report_text_with_new_markers + report_date_line + sources_md_section

    review_result: Dict[str, Any] = {"approved": True, "feedback_points": [], "usage": {"prompt_tokens":0, "completion_tokens":0, "total_tokens":0}}
    
    return_is_comptroller_review_failed = False
    return_comptroller_feedback_for_retake = []
    return_comptroller_hop_credits = state.comptroller_hop_credits
    # Persist active feedback items for the next review, clear if approved.
    # This ensures the comptroller can see what feedback it gave that led to the current draft.
    active_feedback_for_current_review_cycle = list(state.active_comptroller_feedback_items) if state.active_comptroller_feedback_items else []


    logger.info("[%s] SynthesizeReportNode: Checking conditions for Comptroller review. Comptroller instance: %s. Setting DEEP_SEARCH_ENABLE_COMPTROLLER_FINAL_REVIEW: %s", task_id, 'Exists' if comptroller else 'None', settings.DEEP_SEARCH_ENABLE_COMPTROLLER_FINAL_REVIEW)

    if comptroller and settings.DEEP_SEARCH_ENABLE_COMPTROLLER_FINAL_REVIEW: # Check the setting
        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="comptroller_review_start", message="Comptroller performing final draft review..."))) # is_key_summary=True REMOVED
        
        perform_actual_review = True
        # If this synthesis was triggered by feedback (active_feedback_for_current_review_cycle is not empty),
        # and that feedback is repetitive, and we've hit the retry limit, then auto-approve.
        if active_feedback_for_current_review_cycle and is_repetitive and updated_comptroller_feedback_retry_count >= settings.DEEP_SEARCH_MAX_REPETITIVE_FEEDBACK_LIMIT:
            perform_actual_review = False
            review_result = {"approved": True, "feedback_points": ["Review auto-approved due to repetitive feedback limit."], "usage": {"prompt_tokens":0, "completion_tokens":0, "total_tokens":0}}
            logger.warning("[%s] Comptroller review auto-approved due to repetitive feedback limit.", task_id)
        elif state.comptroller_hop_credits <= 0 and active_feedback_for_current_review_cycle : # Only auto-approve due to credits if it's a re-review
            perform_actual_review = False
            review_result = {"approved": True, "feedback_points": ["Review auto-approved as Comptroller credits are exhausted for re-review."], "usage": {"prompt_tokens":0, "completion_tokens":0, "total_tokens":0}}
            logger.warning("[%s] Comptroller review auto-approved as credits are already exhausted (%s) for re-review.", task_id, state.comptroller_hop_credits)

        if perform_actual_review:
            # Pass the previous draft (state.final_report_md before it's updated by current synthesis)
            # and the feedback that led to this synthesis attempt (active_feedback_for_current_review_cycle)
            review_result = await comptroller.review_final_draft(
                draft_report_text=final_report_md,
                original_query=state.original_query,
                all_reasoning_steps=state.all_reasoning_steps,
                covered_reasoning_steps=state.covered_reasoning_steps,
                full_research_plan_data_points=state.full_research_plan_data_points,
                current_state=state,
                full_context_chunks=chunks_for_synthesis, # Pass the full (or vector-filtered) context
                previous_draft_text=state.final_report_md if active_feedback_for_current_review_cycle else None,
                feedback_given_on_previous_draft=active_feedback_for_current_review_cycle
            )
            if review_result.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=state.request_params.reasoning_model_info.get("id", 0), model_name=state.request_params.reasoning_model_info.get("name", "comptroller_review_model"), **review_result["usage"]))
        
        comptroller_feedback_points = review_result.get("feedback_points", [])
        
        if not review_result.get("approved", True) and comptroller_feedback_points: 
            current_credits_before_decrement = state.comptroller_hop_credits 
            updated_credits_after_rejection = current_credits_before_decrement - 1 if current_credits_before_decrement > 0 else 0
            
            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="comptroller_feedback_query_generation", message="Comptroller feedback received. Generating targeted queries...")))
            query_gen_model_info = state.request_params.reasoning_model_info or {}; 
            if not query_gen_model_info.get("name"): query_gen_model_info["name"] = settings.DEFAULT_REASONING_MODEL
            queries_from_feedback_result = await llm_reasoner.generate_queries_from_comptroller_feedback(
                comptroller_feedback=comptroller_feedback_points, 
                original_query=state.original_query, 
                model_info=query_gen_model_info, 
                api_config=state.api_config, 
                user_id=state.user_id, 
                request_id=f"{task_id}_h{state.current_hop}_comptroller_feedback_queries",
                is_cancelled_flag=state.is_cancelled_flag
            )
            new_queries = queries_from_feedback_result.get("queries", [])
            if queries_from_feedback_result.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=query_gen_model_info.get("id",0), model_name=query_gen_model_info.get("name"), **queries_from_feedback_result["usage"]))
            if not new_queries and comptroller_feedback_points: new_queries = comptroller_feedback_points # Use raw feedback if no queries generated
            
            if new_queries and updated_credits_after_rejection >= 0 : 
                 logger.info("[%s] Comptroller rejected draft. Feedback: %s. New queries: %s. Credits updated to: %s", task_id, comptroller_feedback_points, new_queries, updated_credits_after_rejection)
                 return_is_comptroller_review_failed = True
                 return_comptroller_feedback_for_retake = new_queries
                 return_comptroller_hop_credits = updated_credits_after_rejection
                 active_feedback_for_current_review_cycle = list(comptroller_feedback_points) # Store this feedback
                 current_cycle_fact_checked_claims = set() # Reset for the new research/synthesis cycle
            else: 
                 logger.warning("[%s] Comptroller rejected draft. No new queries OR credits exhausted (%s) for re-research. Finalizing with current (rejected) draft. Feedback: %s", task_id, updated_credits_after_rejection, comptroller_feedback_points)
                 return_is_comptroller_review_failed = False 
                 return_comptroller_feedback_for_retake = []
                 return_comptroller_hop_credits = updated_credits_after_rejection
                 active_feedback_for_current_review_cycle = None # Clear if not retrying
        else: # This means review_result.get("approved", True) was True OR comptroller_feedback_points was empty
            logger.info("[%s] Comptroller review resulted in approval OR no actionable feedback points. Approved: %s, Feedback Points: %s", task_id, review_result.get('approved', True), comptroller_feedback_points)
            return_is_comptroller_review_failed = False
            return_comptroller_feedback_for_retake = []
            active_feedback_for_current_review_cycle = None # Clear on approval
            current_cycle_fact_checked_claims = set() # Reset if approved

        await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="comptroller_review_complete", message=f"Comptroller review complete. Approved: {review_result.get('approved')}", details={"approved": review_result.get("approved"), "feedback": comptroller_feedback_points}))) # is_key_summary=True REMOVED
    
    # Only send the markdown chunk if the report is approved (or if comptroller is disabled)
        if not comptroller or not settings.DEEP_SEARCH_ENABLE_COMPTROLLER_FINAL_REVIEW or review_result.get("approved"):
            logger.info("[%s] Sending final approved report markdown to SSE stream.", task_id)
            
            # --- Final Translation Step for English-Fallback Mode ---
            report_to_send = final_report_md_with_sources_and_date
            if state.processing_language == 'en' and state.detected_language != 'en':
                await output_queue.put(models.SSEEvent(task_id=task_id, event_type="progress", payload=models.SSEProgressData(stage="final_translation", message=f"Translating final report back to {state.detected_language}...")))
                final_translation_result = await llm_reasoner.translate_text_async(
                    text_to_translate=report_to_send,
                    target_language=state.detected_language,
                    model_info=state.request_params.synthesis_model_info or {},
                    api_config=state.api_config,
                    user_id=state.user_id,
                    request_id=f"{task_id}_final_report_translation"
                )
                if final_translation_result.get("translated_text"):
                    report_to_send = final_translation_result["translated_text"]
                    if final_translation_result.get("usage"):
                        current_aggregated_tokens.append(models.ModelUsageData(model_id=synthesis_model_info.get("id",0), model_name=synthesis_model_info.get("name"), **final_translation_result["usage"]))

            await output_queue.put(models.SSEEvent(task_id=task_id, event_type="markdown_chunk", payload=models.SSEMarkdownChunkData(chunk_id=0, content=report_to_send, is_final_chunk=True)))
        else:
            logger.info("[%s] Report rejected by comptroller. Markdown not sent to SSE stream in this iteration.", task_id)

    final_node_return = {
        "final_report_md": final_report_md_with_sources_and_date, # Always update state with the latest attempt
        "report_sources": report_sources_list_for_payload, 
        "url_citation_map": current_url_citation_map, 
        "citations_used_map": used_citations_map, 
        "aggregated_token_usage": current_aggregated_tokens, 
        "low_confidence_synthesis_mode": updated_low_confidence_synthesis_mode, 
        "previous_comptroller_feedback": updated_previous_comptroller_feedback, 
        "comptroller_feedback_retry_count": updated_comptroller_feedback_retry_count,
        "is_comptroller_review_failed": return_is_comptroller_review_failed,
        "comptroller_feedback_for_retake": return_comptroller_feedback_for_retake,
        "comptroller_hop_credits": return_comptroller_hop_credits,
        "claims_previously_fact_checked_in_cycle": current_cycle_fact_checked_claims, # Persist the updated set
        "active_comptroller_feedback_items": active_feedback_for_current_review_cycle # Persist or clear
    }
    return final_node_return

async def generate_follow_ups_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id; final_report_md = state.final_report_md; llm_reasoner: LLMReasoning = services["llm_reasoner"]; settings: app_config.Settings = services["settings"]; current_aggregated_tokens = list(state.aggregated_token_usage)
    logger.info("[%s] Entered generate_follow_ups_node.", task_id)
    suggested_follow_ups_list: List[str] = []
    if final_report_md and "No information was gathered" not in final_report_md:
        logger.info("[%s] final_report_md is present, proceeding to generate follow-ups. Report length: %s", task_id, len(final_report_md))
        try:
            model_info_follow_up = state.request_params.reasoning_model_info or {}
            if not model_info_follow_up.get("name"): model_info_follow_up["name"] = settings.DEFAULT_REASONING_MODEL
            follow_up_response_dict = await llm_reasoner.generate_follow_up_suggestions( 
                original_query=state.original_query, 
                synthesized_report=final_report_md, 
                model_info=model_info_follow_up, 
                api_config=state.api_config, 
                user_id=state.user_id, 
                request_id=f"{task_id}_follow_ups_graph",
                is_cancelled_flag=state.is_cancelled_flag
            )
            logger.info("[%s] LLM response for follow-ups: %s", task_id, follow_up_response_dict)
            if follow_up_response_dict.get("usage"): current_aggregated_tokens.append(models.ModelUsageData(model_id=model_info_follow_up.get("id",0), model_name=model_info_follow_up.get("name"), **follow_up_response_dict["usage"]))
            suggested_follow_ups_list = follow_up_response_dict.get("suggestions", [])
            if suggested_follow_ups_list:
                logger.info("[%s] Successfully generated %s follow-up suggestions.", task_id, len(suggested_follow_ups_list))
                await output_queue.put(models.SSEEvent(task_id=task_id, event_type="follow_up_suggestions", payload=models.SSEFollowUpSuggestionsData(suggestions=suggested_follow_ups_list)))
            if follow_up_response_dict.get("error"):
                logger.error("[%s] Error from LLM during follow-up generation: %s", task_id, follow_up_response_dict.get('error'))
        except Exception as e_follow_up: 
            logger.error("[%s] Exception in generate_follow_ups_node: %s", task_id, e_follow_up, exc_info=True)
            suggested_follow_ups_list = [] 
    else:
        logger.warning("[%s] Skipping follow-up generation because final_report_md is missing or empty.", task_id)

    return {"suggested_follow_ups": suggested_follow_ups_list, "aggregated_token_usage": current_aggregated_tokens}

async def finalize_task_node(state: models.OverallState, services: Dict[str, Any], output_queue: asyncio.Queue) -> Dict[str, Any]:
    task_id = state.task_id; duration_display = "N/A"
    if state.start_time_monotonic:
        duration_display = _format_duration_for_finalize(asyncio.get_event_loop().time() - state.start_time_monotonic)
    final_reasoning_steps_coverage = {step: (step in state.covered_reasoning_steps) for step in state.all_reasoning_steps}
    
    complete_payload = models.SSECompleteData(
        message="Multi-hop research completed successfully via LangGraph.", 
        detailed_token_usage=state.aggregated_token_usage, 
        report_sources=state.report_sources, 
        total_hops_executed=state.current_hop -1 if state.current_hop > 0 else 0, 
        final_reasoning_steps_coverage=final_reasoning_steps_coverage, 
        count_total_urls_scraped=state.total_urls_scraped_count, 
        count_total_chunks_indexed=state.total_chunks_indexed_count, 
        stat_total_web_queries_executed=len(state.executed_search_queries), 
        stat_duration_display=duration_display, 
        pre_flight_llm_answer=state.pre_flight_llm_answer,
        suggested_follow_ups=state.suggested_follow_ups
    )
    await output_queue.put(models.SSEEvent(task_id=task_id, event_type="complete", payload=complete_payload))
    return {}
