/**
 * Material 3 (Expressive) component primitives.
 *
 * Usage:
 *   import { Button, Card, Chip, TextField, Icon } from "@/components/md3";
 *   import { mdSearch } from "@/components/md3/icons";
 *
 * Icons are imported separately so the icon generator can discover them.
 */
export { cn, withOverrides } from "./cn";
export { Icon } from "./Icon";
export type { IconProps } from "./Icon";
export { Button, IconButton, Fab, buttonClassName } from "./Button";
export type { ButtonProps, ButtonVariant, ButtonSize, ButtonShape, ButtonColor, IconButtonProps, IconButtonVariant, FabProps } from "./Button";
export { Card, Surface, cardClassName } from "./Card";
export type { CardProps, CardVariant, SurfaceProps, SurfaceTone } from "./Card";
export { Chip, chipClassName } from "./Chip";
export type { ChipProps, ChipVariant } from "./Chip";
export { TextField } from "./TextField";
export type { TextFieldProps, TextFieldVariant } from "./TextField";
export { Select } from "./Select";
export type { SelectProps, SelectOption } from "./Select";
export { Switch, Checkbox, Radio, Slider, RangeSlider } from "./Selection";
export type { SwitchProps, CheckboxProps, RadioProps, SliderProps, RangeSliderProps } from "./Selection";
export { ButtonGroup } from "./ButtonGroup";
export type { ButtonGroupProps } from "./ButtonGroup";
export { SegmentedButton, ConnectedButtonGroup, Tabs } from "./Segmented";
export type { SegmentOption, SegmentedButtonProps, TabItem, TabsProps } from "./Segmented";
export { Dialog } from "./Dialog";
export type { DialogProps, DialogSize } from "./Dialog";
export { BottomSheet, SideSheet } from "./Sheet";
export type { SideSheetProps } from "./Sheet";
export { LinearProgress, CircularProgress, LoadingIndicator } from "./Progress";
export { Menu } from "./Menu";
export type { MenuItemDef, MenuProps } from "./Menu";
export { List, ListItem, Divider, Badge, Tooltip, Snackbar } from "./Misc";
export type { ListItemProps, SnackbarProps } from "./Misc";
export { NavigationDrawerItem, NavigationRailItem, NavigationBar, NavigationBarItem, TopAppBar } from "./Navigation";
export type { TopAppBarProps, TopAppBarVariant } from "./Navigation";
export { useOverlay } from "./useOverlay";
export { PageHeader, SectionCard, Banner, ErrorState, EmptyState, LoadingState, LoadMore, PageContainer } from "./Patterns";
