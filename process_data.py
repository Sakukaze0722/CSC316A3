#!/usr/bin/env python3
"""Process World Bank energy data into clean JSON for D3.js visualization."""
import csv
import json
import os

INPUT_CSV = "/Users/sakuramao/Desktop/world-Bank-Data-by-Indicators/engergy-and-mining/energy-and-mining.csv"
METADATA_CSV = "/Users/sakuramao/Desktop/world-Bank-Data-by-Indicators/engergy-and-mining/Metadata_Country_API_5_DS2_en_csv_v2_3060772.csv"
OUTPUT_DIR = "/Users/sakuramao/Desktop/CSC316A3/data"

# Columns we care about (shortened names for JSON)
COLUMNS_MAP = {
    '"average_value_Access to electricity (% of population)"': 'access_electricity',
    '"average_value_Electricity production from coal sources (% of total)"': 'elec_coal',
    '"average_value_Electricity production from hydroelectric sources (% of total)"': 'elec_hydro',
    '"average_value_Electricity production from natural gas sources (% of total)"': 'elec_gas',
    '"average_value_Electricity production from nuclear sources (% of total)"': 'elec_nuclear',
    '"average_value_Electricity production from oil sources (% of total)"': 'elec_oil',
    '"average_value_Electricity production from renewable sources, excluding hydroelectric (% of total)"': 'elec_renewable',
    '"average_value_Fossil fuel energy consumption (% of total)"': 'fossil_fuel_pct',
    '"average_value_Renewable energy consumption (% of total final energy consumption)"': 'renewable_pct',
    '"average_value_Energy use (kg of oil equivalent per capita)"': 'energy_per_capita',
    '"average_value_Electric power consumption (kWh per capita)"': 'electric_per_capita',
    '"average_value_CO2 emissions from liquid fuel consumption (kt)"': 'co2_liquid',
    '"average_value_Renewable electricity output (% of total electricity output)"': 'renewable_elec_output',
}

def parse_val(v):
    v = v.strip().strip('"')
    if v == '' or v == '..':
        return None
    try:
        return round(float(v), 2)
    except ValueError:
        return None

def main():
    # Read metadata for region/income group
    meta = {}
    with open(METADATA_CSV, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        for row in reader:
            code = row.get('\ufeff"Country Code"') or row.get('Country Code') or row.get('"Country Code"', '')
            code = code.strip().strip('"')
            region = (row.get('Region') or row.get('"Region"', '')).strip().strip('"')
            income = (row.get('IncomeGroup') or row.get('"IncomeGroup"', '')).strip().strip('"')
            if code and region:
                meta[code] = {'region': region, 'income': income}

    # Read main data
    with open(INPUT_CSV, 'r', encoding='utf-8-sig') as f:
        raw_header = f.readline().strip()
        headers = []
        in_quote = False
        current = ''
        for ch in raw_header:
            if ch == '"':
                in_quote = not in_quote
                current += ch
            elif ch == ',' and not in_quote:
                headers.append(current.strip())
                current = ''
            else:
                current += ch
        headers.append(current.strip())

        # Map header indices
        col_indices = {}
        for i, h in enumerate(headers):
            for full_name, short_name in COLUMNS_MAP.items():
                if h.replace('\n', ' ').replace('\r', '') == full_name.replace('\n', ' '):
                    col_indices[i] = short_name
                    break

        # Also find matching headers by substring
        for i, h in enumerate(headers):
            h_clean = h.strip('"').lower()
            if i not in col_indices:
                for full_name, short_name in COLUMNS_MAP.items():
                    fn_clean = full_name.strip('"').lower()
                    if fn_clean in h_clean or h_clean in fn_clean:
                        if short_name not in col_indices.values():
                            col_indices[i] = short_name
                            break

        data = []
        for line in f:
            # Parse CSV line handling quoted fields
            fields = []
            in_quote = False
            current = ''
            for ch in line.strip():
                if ch == '"':
                    in_quote = not in_quote
                elif ch == ',' and not in_quote:
                    fields.append(current.strip().strip('"'))
                    current = ''
                else:
                    current += ch
            fields.append(current.strip().strip('"'))

            if len(fields) < 3:
                continue

            country_name = fields[0]
            country_code = fields[1]
            year = fields[2]

            try:
                year_int = int(year)
            except ValueError:
                continue

            # Skip aggregate regions (no metadata = likely aggregate)
            if country_code not in meta:
                continue

            record = {
                'country': country_name,
                'code': country_code,
                'year': year_int,
                'region': meta[country_code]['region'],
                'income': meta[country_code]['income'],
            }

            has_data = False
            for idx, short_name in col_indices.items():
                if idx < len(fields):
                    val = parse_val(fields[idx])
                    record[short_name] = val
                    if val is not None:
                        has_data = True

            if has_data:
                data.append(record)

    # Save full data
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    with open(os.path.join(OUTPUT_DIR, 'energy.json'), 'w') as f:
        json.dump(data, f)

    print(f"Processed {len(data)} records")
    print(f"Column mappings found: {list(col_indices.values())}")

    # Print sample
    sample = [d for d in data if d['code'] == 'CHN' and d['year'] == 2015]
    if sample:
        print(f"\nSample (China 2015): {json.dumps(sample[0], indent=2)}")

if __name__ == '__main__':
    main()
