import { Box, FormLabel, Select } from '@ksyos/design-system';
import type { Option } from '@ksyos/design-system';
import type { SeedFileInfo } from '../../shared/types';

interface SeedSelectorProps {
    seeds: SeedFileInfo[];
    selectedSeed: string | null;
    loading: boolean;
    onSelect: (fileName: string) => void;
}

export function SeedSelector({ seeds, selectedSeed, loading, onSelect }: SeedSelectorProps) {
    const options: Option[] = seeds.map((s) => ({ label: s.fileName, value: s.fileName }));
    const selectedOption = options.find((o) => o.value === selectedSeed) ?? null;

    return (
        <Box>
            <FormLabel htmlFor="seed-selector" size="medium">Seed file</FormLabel>
            <Select
                inputId="seed-selector"
                options={options}
                value={selectedOption}
                onChange={(option: Option | null) => {
                    if (option?.value) onSelect(option.value);
                }}
                placeholder="Select a seed file…"
                isLoading={loading}
                isDisabled={loading || seeds.length === 0}
                noOptionsMessage={() => 'No flex seeds found'}
                size="medium"
                isSensitiveData={false}
                isClearable
                style={{ minWidth: 300 }}
            />
        </Box>
    );
}
