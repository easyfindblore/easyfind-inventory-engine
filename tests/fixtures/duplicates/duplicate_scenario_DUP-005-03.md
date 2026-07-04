# Duplicate Scenario: Location Typo

## Scenario ID: DUP-005-03

## Expected Outcome: New Property (if parser cannot normalize) or Existing Property Updated (if parser normalizes)

### Message 1 (Base Property)

```
**Furnished** Unfurnished
**BHK** 3 BHK
**Bathrooms** 3
**Balcony** 1 Balcony, Utility
Rent: 60000
Maintenance: included
Deposit: 2.5L
Sq.ft: 1500
Floor: 8th
Available From: July 15
Preferred Tenant: Anyone
Pets: allowed
Community: Semi Gated
Location: Bellandur
Society/Landmark: VRR Fortuna
Google Maps Link: https://maps.app.goo.gl/4nfELrcWceTNMZ61A
```

### Message 2 (Potential Duplicate)

```
**Furnished** Unfurnished
**BHK** 3 BHK
**Bathrooms** 3
**Balcony** 1 Balcony, Utility
Rent: 60000
Maintenance: included
Deposit: 2.5L
Sq.ft: 1500
Floor: 8th
Available From: July 15
Preferred Tenant: Anyone
Pets: allowed
Community: Semi Gated
Location: Bellandua
Society/Landmark: VRR Fortuna
Google Maps Link: https://maps.app.goo.gl/4nfELrcWceTNMZ61A
```

