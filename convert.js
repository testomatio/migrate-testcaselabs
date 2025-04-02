const fs = require('fs');
const csv = require('csv-parse/sync');
const { stringify } = require('csv-stringify/sync');
const path = require('path');

// Get input file from command line arguments
const inputFile = process.argv[2];

if (!inputFile) {
    console.error('Please provide an input file path as an argument');
    console.error('Usage: node convert.js <input-file.csv>');
    process.exit(1);
}

// Generate output filename by adding _Testomatio before the extension
const parsedPath = path.parse(inputFile);
const outputFile = path.join(
    parsedPath.dir,
    `${parsedPath.name}_Testomatio${parsedPath.ext}`
);

function convertTestCases(inputFile, outputFile) {
    // Read and parse input CSV
    const inputData = fs.readFileSync(inputFile, 'utf-8');
    const records = csv.parse(inputData, {
      columns: true,
      relax_column_count: true,
      skip_empty_lines: true,
      trim: true,
    });

    // Define required columns for our new format
    const requiredColumns = [
        'Title', 'Key', 'Suite'
    ];

    // Validate columns
    const inputColumns = Object.keys(records[0]);
    const missingColumns = requiredColumns.filter(col => !inputColumns.includes(col));

    if (missingColumns.length > 0) {
        console.error('The following required columns are missing from the input file:', missingColumns.join(', '));
        process.exit(1);
    }

    const transformedData = [];

    records.forEach(record => {
        console.log('✅', record['Title']);

        const steps = [];
        const labels = [];

        let description = record['Description'] || '';

        // Add precondition if it exists in description
        if (description.includes('Preconditions')) {
            description = description.replace(/\*\*Preconditions\*\*/g, '## Preconditions');
        }

        description = processDescriptionLinks(description)


        if (record['Test Type']) {
          labels.push(record['Test Type'])
        }

        // Add steps section header
        steps.push('\n\n## Steps\n');

        // Process step/result pairs (Step 1/Result 1, Step 2/Result 2, etc.)
        for (let i = 1; i <= 100; i++) {
            const stepKey = `Step ${i}`;
            const resultKey = `Result ${i}`;

            if (!record[stepKey]) break;

            if (record[stepKey] && record[stepKey].trim()) {
                steps.push(`* ${cleanHtml(record[stepKey].trim())}`);

                if (record[resultKey] && record[resultKey].trim()) {
                    steps.push(`  *Expected:* ${cleanHtml(record[resultKey].trim())}`);
                }
            }
        }

        // If there are additional steps in the "Steps" field
        if (record['Steps'] && record['Steps'].trim()) {
            const stepsLines = record['Steps'].split('\n');
            stepsLines.forEach(line => {
                if (line.trim()) {
                    steps.push(`* ${cleanHtml(line.trim())}`);
                }
            });

            // If there's an overall expected result
            if (record['Expected Result'] && record['Expected Result'].trim()) {
                steps.push(`  *Expected:* ${cleanHtml(record['Expected Result'].trim())}`);
            }
        }

        // Create test case object
        const testCase = {
            'ID': createId(record['Key']),
            'Title': record['Title'],
            'Folder': record['Suite'].replace(/->/g, '/'), // Replace -> with / for proper nesting
            'Emoji': '',
            'Priority': mapPriority(record['Priority']),
            'Tags': record['Tags'] || '',
            'Owner': record['Created By'] || '',
            'Description': description + '\n\n' + steps.join('\n'),
            'Examples': '',
            'Labels': labels.join(','),
        };

        transformedData.push(testCase);
    });

    // Write to output CSV
    const output = stringify(transformedData, {
        header: true,
        columns: [
            'ID', 'Title', 'Folder', 'Emoji', 'Priority',
            'Tags', 'Owner', 'Description', 'Examples', 'Labels', 'Url', 'Matched'
        ]
    });

    fs.writeFileSync(outputFile, output);
    console.log(`Conversion complete. Output written to ${outputFile}`);
}

function mapPriority(priority) {
    const priorityMap = {
        'Blocker': 'high',
        'Critical': 'high',
        'Major': 'normal',
        'Minor': 'normal',
        'Trivial': 'low',
        'High': 'high',
        'Normal': 'normal',
        'Low': 'low'
    };
    return priorityMap[priority] || 'normal';
}

function cleanHtml(text) {
    if (!text) return '';
    return text
        .replace(/<br\s*\/?>/gi, '\n')  // Replace <br> with newline
        .replace(/<\/?(p|span|div|ul|li)[^>]*>/gi, '') // Remove p, ul, li tags
        .replace(/\n\s*\n/g, '\n')  // Remove multiple newlines
        .replace(/\*\*/g, '') // Remove all ** characters completely
        .trim();
}

try {
    convertTestCases(inputFile, outputFile);
} catch (error) {
    console.error('Error during conversion:', error.message);
}

function createId(Id) {
  if (!Id) return;
  return `T${Id.toString().replace(/-/g, '').toLowerCase().padStart(8, '0')}`;
}

function processDescriptionLinks(description) {
  if (!description) return description;

  const regex = /https?:\/\/[^\/]*testcaselab\.com\/projects\/[^\/]+\/test_cases\?text=([^&\s"']+)/g;

  return description.replace(regex, (match, textParam) => {
    return `[${textParam}](${createId(textParam).slice(1)})`;
  });
}
