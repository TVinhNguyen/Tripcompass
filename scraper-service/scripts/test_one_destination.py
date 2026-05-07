#!/usr/bin/env python3
"""
Test script: import one destination to verify workflow
"""

import sys
sys.path.insert(0, str(__import__('pathlib').Path(__file__).parent.parent))

# Import the main script functions
from scripts.direct_import_all import (
    import_destination,
)

if __name__ == "__main__":
    # Test with Da Nang first
    import_destination("Đà Nẵng", "Da Nang")
