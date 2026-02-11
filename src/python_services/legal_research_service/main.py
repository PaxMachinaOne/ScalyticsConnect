# SPDX-License-Identifier: Apache-2.0
# Copyright 2024-present Scalytics, Inc. (https://www.scalytics.io)
import argparse
import json
import sys
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

from .legal_research_graph import legal_research_graph
from .models import LegalResearchState

def main():
    parser = argparse.ArgumentParser(description="Run the legal research agent.")
    parser.add_argument("--query", type=str, required=True, help="The legal query to research.")
    parser.add_argument("--user-id", type=str, required=True, help="The ID of the user initiating the research.")
    parser.add_argument("--research-id", type=str, required=True, help="The unique ID for this research task.")
    parser.add_argument("--api-key", type=str, required=True, help="The CourtListener API key.")
    
    args = parser.parse_args()

    print(f"Starting legal research for user {args.user_id} with query: '{args.query}'")
    
    initial_state = LegalResearchState(query=args.query, api_key=args.api_key)
    
    # The `stream` method in langgraph returns an iterator. We'll consume it to get the final state.
    final_state = None
    for event in legal_research_graph.stream(initial_state):
        # The final state is the value of the last event
        final_state = event

    # Output the final state as a JSON object
    if final_state:
        # The actual state is nested inside the graph's output key (which is the name of the state class)
        final_state_dict = final_state.get('__end__')
        if final_state_dict:
            print(json.dumps(final_state_dict, indent=2))

if __name__ == "__main__":
    # This is necessary to run the script directly and allow relative imports
    sys.path.append('.')
    main()
