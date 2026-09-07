export type RobotFile = {
  id: string;
  kind: string;
  name: string;
  mime: string;
};
export type Robot = {
  id: string;
  version: number;
  ownerName: string;
  modelId: string | null;
  serialNumber: string | null;
  location: string;
  notes: string;
  publicId: string | null;
  lifecycle: string;
  condition: string;
  nameplateId: string | null;
  presentationId: string | null;
  insurance: string;
  tracker: string;
  files?: RobotFile[];
  records?: OperationalRecord[];
  audit?: {
    id: string;
    kind: string;
    actorEmail: string;
    createdAt: string;
    data: unknown;
  }[];
};
export type OperationalRecord = {
  id: string;
  kind: string;
  data: Record<string, string | boolean | string[]>;
  eventAt: string;
  actorEmail: string;
  createdAt: string;
  supersedesId: string | null;
  correctionReason: string | null;
};
export type RegistryCall = (
  path: string,
  method?: string,
  body?: unknown,
) => Promise<any>;
export type RobotPanelProps = {
  robot: Robot;
  call: RegistryCall;
  busy: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  reload: () => Promise<void>;
};
export const field = "w-full rounded-lg border border-neutral-300 bg-white p-3";
export const button =
  "rounded-lg bg-black px-4 py-2 text-white disabled:opacity-50";
