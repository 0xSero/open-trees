import { Rpc } from "@opencode/plugin";

export const OpenTreesEvents = Rpc.define({
  id: "open-trees",
  methods: {},
  events: {
    openSessions: {
      schema: {
        type: "object",
        properties: { sessionID: { type: "string" } },
        required: ["sessionID"],
        additionalProperties: false,
      },
    },
  },
});
