# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
from typing import List, Dict, Optional, Any, Set, Tuple, Literal, Union
from pydantic import BaseModel, Field, HttpUrl
import asyncio
import uuid

class DeepSearchRequestParams(BaseModel):
    initial_query: str
    search_providers: Optional[List[str]] = None
    reasoning_model_info: Optional[Dict[str, Any]] = None
    synthesis_model_info: Optional[Dict[str, Any]] = None
    max_hops: Optional[int] = None
    max_total_urls_per_task: Optional[int] = None
    max_distinct_search_queries: Optional[int] = None
    max_results_per_provider_query: Optional[int] = None
    top_k_retrieval_per_hop: Optional[int] = None
    chunk_size_words: Optional[int] = None
    chunk_overlap_words: Optional[int] = None
    max_url_exploration_depth: Optional[int] = None
    is_document_focused_query: bool = False
    document_references: Optional[List[Dict[str, Any]]] = None
    task_date_context: Optional[str] = None

class DeepSearchRequest(BaseModel):
    user_id: str
    request_params: DeepSearchRequestParams
    api_config: Optional[Dict[str, Any]] = None

class TaskCreationResponse(BaseModel):
    task_id: str
    status: str
    stream_url: str
    cancel_url: str

class CancellationResponse(BaseModel):
    task_id: str
    status: str
    message: Optional[str] = None

class TaskStatusResponse(BaseModel):
    task_id: str
    status: str
    progress_message: Optional[str] = None

class SSEProgressData(BaseModel):
    stage: str
    message: str
    details: Optional[Dict[str, Any]] = None
    is_key_summary: Optional[bool] = None

class SSEErrorData(BaseModel):
    error_message: str
    stage: Optional[str] = None
    is_fatal: bool = False

class SSECancelledData(BaseModel):
    message: str

class SSEMarkdownChunkData(BaseModel):
    chunk_id: int
    content: str
    is_final_chunk: bool = False

class SSEPreFlightAnswerData(BaseModel):
    answer_text: str
    message: str

class SSEFollowUpSuggestionsData(BaseModel):
    suggestions: List[str]

class ReportSourceItem(BaseModel):
    url: str
    title: Optional[str] = None
    citation_marker: str
    trust_score: Optional[float] = None
    provider_name: Optional[str] = None
    domain: Optional[str] = None
    retrieved_at: Optional[str] = None

class ModelUsageData(BaseModel):
    model_id: Optional[int] = None
    model_name: Optional[str] = None
    prompt_tokens: int
    completion_tokens: int
    total_tokens: int

class SSECompleteData(BaseModel):
    message: str
    detailed_token_usage: List[ModelUsageData]
    report_sources: List[ReportSourceItem]
    total_hops_executed: int
    final_reasoning_steps_coverage: Dict[str, bool]
    count_total_urls_scraped: int
    count_total_chunks_indexed: int
    stat_total_web_queries_executed: int
    stat_duration_display: str
    suggested_follow_ups: List[str]
    pre_flight_llm_answer: Optional[str] = None

class SSEEvent(BaseModel):
    task_id: str
    event_type: Literal["progress", "markdown_chunk", "error", "complete", "cancelled", "heartbeat", "follow_up_suggestions", "pre_flight_answer"]
    payload: Union[SSEProgressData, SSEMarkdownChunkData, SSEErrorData, SSECompleteData, SSECancelledData, SSEFollowUpSuggestionsData, SSEPreFlightAnswerData, Dict[str, Any]]

class SearchResultItem(BaseModel):
    url: str
    title: Optional[str] = None
    snippet: Optional[str] = None
    provider_name: str
    query_phrase_used: str
    position: int

class ContentChunk(BaseModel):
    chunk_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    original_url: str
    page_title: Optional[str] = None
    text_content: str
    chunk_index_in_page: int
    depth: int
    vector_metadata: Dict[str, Any] = Field(default_factory=dict)

class CandidateLinkToExplore(BaseModel):
    url: str
    source_page_url: str
    calculated_depth: int
    anchor_text: Optional[str] = None
    context_around_link: Optional[str] = None
    priority_score: float = 0.5

    def __lt__(self, other: 'CandidateLinkToExplore') -> bool:
        # For heapq, which is a min-heap, we store negative priority
        # So, higher positive priority means "smaller" in min-heap terms
        if self.priority_score == other.priority_score:
            return self.calculated_depth < other.calculated_depth # Lower depth is better for tie-breaking
        return self.priority_score > other.priority_score # Higher score is better

class LibrarianAnalysisResult(BaseModel):
    answered_questions: List[str] = Field(default_factory=list)
    key_facts: Dict[str, str] = Field(default_factory=dict)
    missing_info: str = "No specific missing information identified."
    confidence: float = Field(default=0.0, ge=0.0, le=1.0)
    covered_reasoning_steps: List[str] = Field(default_factory=list)
    key_information_for_covered_steps: Dict[str, str] = Field(default_factory=dict)
    newly_identified_keywords_or_entities: List[str] = Field(default_factory=list)
    suggested_new_sub_queries: List[str] = Field(default_factory=list)
    remaining_gaps_summary: str = "Analysis pending or no significant gaps identified."
    verification_outcome: Literal["CONFIRMED", "CONTRADICTED", "INCONCLUSIVE", "NOT_APPLICABLE"] = "NOT_APPLICABLE"
    verification_reasoning: Optional[str] = None
    confirmed_value: Optional[str] = None
    verified_query_phrase_if_any: Optional[str] = None

class ChunkSummary(BaseModel):
    chunk_id: str
    source_url: str
    title: Optional[str] = None
    brief_snippet: str
    relevance_score: Optional[float] = None
    depth: int

class MultiHopProgressData(BaseModel):
    current_hop: int
    max_hops: int
    hop_stage_name: str
    hop_stage_message: str
    initial_reasoning_steps: List[str]
    covered_reasoning_steps: List[str]
    uncovered_reasoning_steps: List[str]
    newly_covered_this_hop: Optional[List[str]] = None
    new_queries_for_next_hop: Optional[List[str]] = None
    top_chunks_summary: Optional[List[ChunkSummary]] = None

class TypedEntity(BaseModel):
    text: str
    type: str

class TypedRelationship(BaseModel):
    subject: TypedEntity
    predicate: str
    object: TypedEntity
    predicate_type: str
    confidence_score: float = Field(ge=0.0, le=1.0)
    context_snippet: Optional[str] = None

class ExtractedLinkItem(BaseModel):
    url: str
    anchor_text: Optional[str] = None
    context_around_link: Optional[str] = None

class TargetedSiteExplorationDirective(BaseModel):
    target_domain: str
    prioritized_internal_urls: List[str]
    max_pages_for_this_exploration: int
    reasoning: str

class GenericDocumentItem(BaseModel):
    id: str
    text_content: str
    metadata: Dict[str, Any] = Field(default_factory=dict)

class AddDocumentsRequest(BaseModel):
    group_id: str
    documents: List[GenericDocumentItem]

class VectorSearchRequest(BaseModel):
    query_text: str
    top_k: int = 10
    group_id: Optional[str] = None

class VectorSearchResultItem(BaseModel):
    id: str
    text_content: Optional[str] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)
    similarity: Optional[float] = None

class VectorSearchResponse(BaseModel):
    success: bool
    message: str
    results: List[VectorSearchResultItem]

class DeleteByGroupIdRequest(BaseModel):
    group_id: str

class GeneralVectorResponse(BaseModel):
    success: bool
    message: str
    details: Optional[Dict[str, Any]] = None

class EmbedTextsRequest(BaseModel):
    texts: List[str]
    model_identifier: Optional[str] = None

class EmbedTextsResponse(BaseModel):
    embeddings: List[List[float]]
    model_used: str
    dimension: int

class IngestDocumentsRequest(BaseModel):
    documents: List[Dict[str, Any]]
    reasoning_model_info: Optional[Dict[str, Any]] = None
    api_config: Optional[Dict[str, Any]] = None

class OverallState(BaseModel):
    task_id: str
    user_id: str
    original_query: str

    detected_language: str = "en"
    query_in_english: Optional[str] = None
    processing_language: str = "en"

    request_params: DeepSearchRequestParams
    api_config: Dict[str, Any]

    start_time_monotonic: Optional[float] = None
    max_hops: int
    max_total_urls_per_task: int
    max_stagnation_limit: int
    current_reasoning_dynamic_temperature: float
    
    aggregated_token_usage: List[ModelUsageData] = Field(default_factory=list)
    current_hop: int = 0
    
    full_research_plan_data_points: List[Dict[str, Any]] = Field(default_factory=list)
    all_reasoning_steps: List[str] = Field(default_factory=list)
    covered_reasoning_steps: Set[str] = Field(default_factory=set)
    
    current_queries_for_hop: List[str] = Field(default_factory=list)
    executed_search_queries: Set[str] = Field(default_factory=set)
    failed_search_queries: List[str] = Field(default_factory=list)
    successful_search_queries: List[str] = Field(default_factory=list)
    
    links_to_explore_pq: List[Tuple[float, int, CandidateLinkToExplore]] = Field(default_factory=list)
    pq_tie_breaker: int = 0
    
    stagnation_counter: int = 0
    is_cancelled_flag: asyncio.Event = Field(default_factory=asyncio.Event, exclude=True)

    fact_centric_strategy_active: bool = False
    core_entity: Optional[str] = None
    target_attributes: List[str] = Field(default_factory=list)
    fact_centric_proposed_attributes: Dict[str, Any] = Field(default_factory=dict)
    fact_centric_verified_attributes: Dict[str, Any] = Field(default_factory=dict)
    fact_centric_verification_query_map: Dict[str, str] = Field(default_factory=dict)
    ask_llm_verification_map: Dict[str, Dict[str, str]] = Field(default_factory=dict)

    accumulated_top_chunks_for_synthesis: List[ContentChunk] = Field(default_factory=list)
    all_processed_chunks_this_task: Dict[str, ContentChunk] = Field(default_factory=dict)
    
    visited_urls: Set[str] = Field(default_factory=set)
    site_exploration_depth_tracker: Dict[str, int] = Field(default_factory=dict)
    permanently_failed_urls_this_task: Set[str] = Field(default_factory=set)
    page_link_details_map: Dict[str, List[ExtractedLinkItem]] = Field(default_factory=dict)

    search_results_this_hop: List[SearchResultItem] = Field(default_factory=list)
    processed_chunks_this_hop: List[ContentChunk] = Field(default_factory=list)
    newly_extracted_links_this_hop: List[CandidateLinkToExplore] = Field(default_factory=list)
    librarian_analysis_result: Optional[LibrarianAnalysisResult] = None
    
    document_context_summary: Optional[str] = None

    final_report_md: Optional[str] = None
    report_sources: List[ReportSourceItem] = Field(default_factory=list)
    suggested_follow_ups: List[str] = Field(default_factory=list)
    pre_flight_llm_answer: Optional[str] = None
    url_citation_map: Dict[str, str] = Field(default_factory=dict)
    citations_used_map: Dict[str, str] = Field(default_factory=dict)

    total_urls_scraped_count: int = 0
    total_chunks_indexed_count: int = 0
    
    similarity_stop_triggered_this_hop: bool = False
    hops_since_last_temp_increase: int = 0
    significant_progress_after_temp_increase: bool = False
    consecutive_low_diversity_hops: int = 0
    newly_covered_in_hop_check: List[str] = Field(default_factory=list)
    task_date_context: Optional[str] = None

    comptroller_hop_credits: int = 1
    is_comptroller_review_failed: bool = False
    comptroller_feedback_for_retake: List[str] = Field(default_factory=list)
    force_reexecute_queries_this_hop: Set[str] = Field(default_factory=set)
    low_confidence_synthesis_mode: bool = False
    comptroller_strategy_re_evaluation_needed: bool = False
    previous_comptroller_feedback: List[List[str]] = Field(default_factory=list)
    comptroller_feedback_retry_count: int = 0
    claims_previously_fact_checked_in_cycle: Set[str] = Field(default_factory=set)
    active_comptroller_feedback_items: Optional[List[str]] = None
    previous_librarian_summary: Optional[str] = None
    consecutive_stagnation_hops: int = 0

    class Config:
        arbitrary_types_allowed = True
