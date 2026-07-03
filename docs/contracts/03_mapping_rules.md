# Document 03  
# Mapping Rules (Normalization Contract)  

**Version:** 1.0    
**Status:** Final    
**Repository:** `docs/03_mapping_rules.md`  

---  

# Purpose  

This document defines how raw property information received from WhatsApp is normalized before being inserted into the Live Tracking sheet.  

The parser extracts values.  

This document standardizes those values.  

Google Sheets should receive only normalized values.  

---  

# Core Principles  

1. Never modify the user's raw message.  
2. Raw Message column always stores the original message exactly.  
3. Only normalized values are written into inventory columns.  
4. If a value cannot be confidently mapped, leave the destination cell blank.  
5. Never invent information.  

[Content continues exactly as provided by the user.]
