export const FILE_COLORS = ['#0061A4', '#B3261E', '#2D6B28', '#E68619', '#6750A4'] as const;

export const getFileColor = (index: number): string => {
  return FILE_COLORS[index % FILE_COLORS.length];
};
