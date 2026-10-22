"use client";

import useRentModal from "@/hook/useRentModal";
import useIndividualRentModal from "@/hook/useIndividualRentModal";
import { individualEarningsCopy } from "@/lib/individualListing";
import axios from "axios";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { FieldValues, SubmitHandler, useForm } from "react-hook-form";
import { toast } from "react-toastify";
import { getMetroCentroid, getMetroLabel } from "@/lib/metro";
import useZipCheck from "@/hook/useZipCheck";

import { SERVICE_CATEGORY_META } from "@/lib/serviceCategories";
import { defaultCategoryForUseCases } from "@/lib/useCases";

import Heading from "../Heading";
import CategoryInput from "../inputs/CategoryInput";
import ImageUpload from "../inputs/ImageUpload";
import Input from "../inputs/Input";
import RobotPicker from "../inputs/RobotPicker";
import RegisteredRobotPicker, { type RegisteredRobot } from "../inputs/RegisteredRobotPicker";
import { formatTier } from "@/lib/priceTiers";
import VideoUpload from "../inputs/VideoUpload";
import Modal from "./Modal";
import type { RobotModelOption } from "@/hook/useRobotModels";

type Mode = "provider" | "individual";
type Props = { mode?: Mode };

enum STEPS {
  ROBOT = 0,
  CATEGORY = 1,
  LOCATION = 2,
  IMAGES = 3,
  DETAILS = 4,
  PRICE = 5,
}

function RentModal({ mode = "provider" }: Props) {
  const isIndividual = mode === "individual";
  const defaultCenter = getMetroCentroid("LA");
  const router = useRouter();
  const providerModal = useRentModal();
  const individualModal = useIndividualRentModal();
  const rentModel = isIndividual ? individualModal : providerModal;
  const [step, setStep] = useState(STEPS.ROBOT);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedRobot, setSelectedRobot] = useState<RobotModelOption | null>(null);
  // Provider services are built on a registered robot; its model drives the rest.
  const [selectedAsset, setSelectedAsset] = useState<RegisteredRobot | null>(null);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
    reset,
  } = useForm<FieldValues>({
    defaultValues: {
      robotModelId: null,
      robotAssetId: null,
      category: "",
      zipCode: "",
      imageSrc: "",
      videoSrc: "",
      skuImageSrc: "",
      sku: "",
      title: "",
      description: "",
    },
  });

  const category: string = watch("category") ?? "";
  const zipCode: string = watch("zipCode") ?? "";
  const imageSrc = watch("imageSrc");
  const videoSrc = watch("videoSrc");
  const skuImageSrc = watch("skuImageSrc");

  const { zipData, invalid: zipInvalid } = useZipCheck(zipCode);

  const Map = useMemo(
    () =>
      dynamic(() => import("../Map"), {
        ssr: false,
      }),
    []
  );

  const setCustomValue = (id: string, value: any) => {
    setValue(id, value, {
      shouldValidate: true,
      shouldDirty: true,
      shouldTouch: true,
    });
  };

  // Picking a catalog robot pre-fills title/description/image and suggests a
  // service scenario (all still editable). Price stays server-derived.
  const onSelectRobot = (robot: RobotModelOption | null) => {
    setSelectedRobot(robot);
    setCustomValue("robotModelId", robot ? robot.id : null);
    if (robot) {
      setCustomValue("title", robot.productName);
      setCustomValue("description", robot.description ?? "");
      if (robot.imageUrl) {
        setCustomValue("imageSrc", robot.imageUrl);
      }
      setCustomValue("category", defaultCategoryForUseCases(robot.useCase));
    }
  };

  const onSelectRegistered = (robot: RegisteredRobot | null) => {
    setSelectedAsset(robot);
    setCustomValue("robotAssetId", robot ? robot.id : null);
    onSelectRobot(robot ? robot.model : null);
  };

  const onBack = () => {
    setStep((value) => value - 1);
  };

  const onNext = () => {
    setStep((value) => value + 1);
  };

  const onSubmit: SubmitHandler<FieldValues> = (data) => {
    if (step === STEPS.ROBOT && !selectedRobot) {
      toast.error("Please select a robot to continue.");
      return;
    }

    if (step === STEPS.CATEGORY && !category) {
      toast.error("Please choose a service scenario to continue.");
      return;
    }

    if (step === STEPS.LOCATION) {
      if (!zipData) {
        return;
      }
      return onNext();
    }

    if (step !== STEPS.PRICE) {
      return onNext();
    }

    setIsLoading(true);

    axios
      .post("/api/listings", { ...data, isIndividualOwned: isIndividual })
      .then(() => {
        toast.success(isIndividual ? "Robot listed — an operator can now pick it up." : "Service created!");
        router.refresh();
        reset();
        setSelectedRobot(null);
        setSelectedAsset(null);
        setStep(STEPS.ROBOT);
        rentModel.onClose();
      })
      .catch((error) => {
        toast.error(error?.response?.data?.error ?? "Something went wrong");
      })
      .finally(() => {
        setIsLoading(false);
      });
  };

  const actionLabel = useMemo(() => {
    if (step === STEPS.PRICE) {
      return isIndividual ? "List robot" : "Create Service";
    }

    return "Next";
  }, [step, isIndividual]);

  const secondActionLabel = useMemo(() => {
    if (step === STEPS.ROBOT) {
      return undefined;
    }

    return "Back";
  }, [step]);

  let bodyContent = isIndividual ? (
    <div className="flex flex-col gap-6">
      <Heading
        title="Choose your robot"
        subtitle="Pick a robot from our catalog to start your listing."
      />
      <RobotPicker selectedId={selectedRobot?.id ?? null} onSelect={onSelectRobot} />
    </div>
  ) : (
    <div className="flex flex-col gap-6">
      <Heading
        title="Choose a registered robot"
        subtitle="Only robots registered in the Robot Registry can be listed. Its model sets the price."
      />
      <RegisteredRobotPicker selectedId={selectedAsset?.id ?? null} onSelect={onSelectRegistered} />
    </div>
  );

  if (step === STEPS.CATEGORY) {
    bodyContent = (
      <div className="flex flex-col gap-6">
        <Heading
          title="Which service scenario is this?"
          subtitle="Customers browse by scenario — pick the one this package is sold into."
        />
        <div className="grid max-h-[50vh] grid-cols-1 gap-3 overflow-y-auto md:grid-cols-2">
          {SERVICE_CATEGORY_META.map((item) => (
            <CategoryInput
              key={item.slug}
              icon={item.icon}
              label={item.label}
              selected={category === item.label}
              onClick={(value) => setCustomValue("category", value)}
            />
          ))}
        </div>
      </div>
    );
  }

  if (step === STEPS.LOCATION) {
    bodyContent = (
      <div className="flex flex-col gap-8">
        <Heading
          title="Where does this service operate?"
          subtitle="Enter a zip code within one of our supported metros."
        />
        <input
          type="text"
          inputMode="numeric"
          maxLength={5}
          placeholder="Enter zip code"
          value={zipCode}
          onChange={(e) =>
            setCustomValue(
              "zipCode",
              e.target.value.replace(/\D/g, "").slice(0, 5)
            )
          }
          className={`w-full p-4 font-light bg-white border-2 rounded-md outline-none transition ${
            zipInvalid
              ? "border-red-500 focus:border-red-500"
              : "border-neutral-300 focus:border-black"
          }`}
        />
        {zipData && (
          <div className="inline-flex self-start items-center gap-2 rounded-full bg-neutral-100 px-4 py-2 text-sm font-medium text-neutral-800">
            <span className="h-2 w-2 rounded-full bg-black" />
            {getMetroLabel(zipData.metro)}
          </div>
        )}
        {zipInvalid && (
          <p className="text-sm text-red-500 -mt-4">
            That zip isn&apos;t in a supported service area.
          </p>
        )}
        <Map
          center={zipData ? [zipData.lat, zipData.lng] : defaultCenter}
          metro={zipData?.metro}
          zipCode={zipData ? zipCode : undefined}
        />
      </div>
    );
  }

  if (step === STEPS.IMAGES) {
    bodyContent = (
      <div className="flex flex-col gap-8">
        <Heading
          title="Add service visuals"
          subtitle="Show customers the robot, and upload a photo of its SKU label."
        />
        <ImageUpload
          onChange={(value) => setCustomValue("imageSrc", value)}
          value={imageSrc}
        />
        <hr />
        <Heading title="SKU photo" subtitle="Upload a clear photo of the robot's SKU label." />
        <ImageUpload
          onChange={(value) => setCustomValue("skuImageSrc", value)}
          value={skuImageSrc}
        />
        <VideoUpload
          onChange={(value) => setCustomValue("videoSrc", value)}
          value={videoSrc}
        />
      </div>
    );
  }

  if (step === STEPS.DETAILS) {
    bodyContent = (
      <div className="flex flex-col gap-8">
        <Heading
          title="Describe the service package"
          subtitle="Add a clear title, description, and the robot's SKU."
        />
        <Input
          id="title"
          label="Service Detail"
          disabled={isLoading}
          register={register}
          errors={errors}
          required
        />
        <hr />
        <Input
          id="description"
          label="Description"
          disabled={isLoading}
          register={register}
          errors={errors}
          required
        />
        <hr />
        <Input
          id="sku"
          label="SKU"
          disabled={isLoading}
          register={register}
          errors={errors}
          required
        />
      </div>
    );
  }

  if (step === STEPS.PRICE) {
    const tiers = [
      selectedRobot?.priceHourly != null ? `$${selectedRobot.priceHourly.toLocaleString()}/hr` : null,
      selectedRobot?.priceDaily != null ? `$${selectedRobot.priceDaily.toLocaleString()}/day` : null,
      selectedRobot?.priceMonthly != null ? `$${selectedRobot.priceMonthly.toLocaleString()}/mo` : null,
    ].filter(Boolean);

    bodyContent = (
      <div className="flex flex-col gap-8">
        <Heading
          title={isIndividual ? "Your earnings" : "Your price"}
          subtitle={
            isIndividual
              ? "An operator will run this robot. Here's your share of the price."
              : "This price is set for the robot you selected."
          }
        />
        <div className="rounded-xl border-2 border-neutral-200 p-6 text-center">
          <p className="text-2xl font-semibold text-black">
            {tiers.length ? tiers.join("  ·  ") : "No price set for this model yet"}
          </p>
          {isIndividual ? (
            <p className="mt-2 text-sm text-neutral-700 font-medium">
              {individualEarningsCopy()}
            </p>
          ) : (
            <p className="mt-2 text-sm text-neutral-500">
              Billed per day at checkout for now. Hourly and monthly options are coming soon.
            </p>
          )}
        </div>
        {!isIndividual && selectedAsset && (
          <div className="rounded-xl border border-neutral-200 p-4 text-sm">
            <p className="font-semibold">
              {selectedAsset.publicId} · {selectedAsset.model.brand} {selectedAsset.model.model}
            </p>
            {selectedAsset.model.priceTiers.length > 0 ? (
              <>
                <p className="mt-2 text-neutral-500">Tiered prices from the model&apos;s price sheet</p>
                <ul className="mt-1 space-y-0.5">
                  {selectedAsset.model.priceTiers.map((t) => (
                    <li key={`${t.unit}-${t.minQty}`}>{formatTier(t)}</li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="mt-2 text-neutral-500">No tiered prices set for this model.</p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Modal
      disabled={isLoading}
      isOpen={rentModel.isOpen}
      title={isIndividual ? "List your robot" : "Create a service"}
      actionLabel={actionLabel}
      onSubmit={handleSubmit(onSubmit)}
      secondaryActionLabel={secondActionLabel}
      secondaryAction={step === STEPS.ROBOT ? undefined : onBack}
      onClose={rentModel.onClose}
      body={bodyContent}
    />
  );
}

export default RentModal;
